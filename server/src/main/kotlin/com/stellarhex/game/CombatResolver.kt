package com.stellarhex.game

import com.stellarhex.model.*
import com.stellarhex.world.NoiseGenerator
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.roundToInt

data class StrikeResult(
    val rawDamage: Int,
    val shieldDamage: Int,
    val hullDamage: Int,
    val isCrit: Boolean,
)

data class CombatResult(
    val attackerDamage: Int,
    val defenderDamage: Int,
    val attackerShieldDamage: Int,
    val defenderShieldDamage: Int,
    val attackerDestroyed: Boolean,
    val defenderDestroyed: Boolean,
    val attackerXpGain: Int,
    val defenderXpGain: Int,
    val attackerStrike: StrikeResult,
    val defenderStrike: StrikeResult?,
)

data class CombatOptions(
    val attackerInOwnInfluence: Boolean = false,
    val defenderInOwnInfluence: Boolean = false,
    val attackerInEnemyInfluence: Boolean = false,
    val defenderInEnemyInfluence: Boolean = false,
)

data class BuildingCombatResult(
    val damage: Int,
    val shieldDamage: Int,
    val hullDamage: Int,
    val destroyed: Boolean,
    val attackerXpGain: Int,
    val strike: StrikeResult,
)

object CombatResolver {

    /**
     * Resolve combat between attacker and defender.
     */
    fun resolveCombat(
        attacker: UnitData,
        defender: UnitData,
        attackerRange: Int,
        seed: Int,
        options: CombatOptions? = null,
    ): CombatResult {
        val rng = NoiseGenerator.seededRNG(seed)

        // Compute influence damage multipliers
        var defenderIncomingMul = 1.0
        if (options?.defenderInOwnInfluence == true) defenderIncomingMul *= 0.9
        if (options?.defenderInEnemyInfluence == true) defenderIncomingMul *= 1.1

        var attackerIncomingMul = 1.0
        if (options?.attackerInOwnInfluence == true) attackerIncomingMul *= 0.9
        if (options?.attackerInEnemyInfluence == true) attackerIncomingMul *= 1.1

        // Attacker strikes
        val attackerStrike = resolveStrike(attacker, defender, rng, defenderIncomingMul)

        // Apply attacker's strike to defender
        val defenderShieldsAfter = max(0, defender.shields - attackerStrike.shieldDamage)
        val defenderHealthAfter = defender.health - attackerStrike.hullDamage
        val defenderDestroyed = defenderHealthAfter <= 0

        // Defender retaliates only if alive AND attacker within defender's range
        var defenderStrike: StrikeResult? = null
        if (!defenderDestroyed && defender.weapon != null && attackerRange <= defender.range) {
            val defenderAfterHit = defender.copy(
                shields = defenderShieldsAfter,
                health = defenderHealthAfter,
            )
            defenderStrike = resolveStrike(defenderAfterHit, attacker, rng, attackerIncomingMul)
        }

        val attackerHullDmg = defenderStrike?.hullDamage ?: 0
        val attackerShieldDmg = defenderStrike?.shieldDamage ?: 0
        val attackerHealthAfter = attacker.health - attackerHullDmg
        val attackerDestroyed = attackerHealthAfter <= 0

        // XP calculation
        var attackerXpGain = 0
        var defenderXpGain = 0

        if (attacker.weapon != null) {
            attackerXpGain += attackerStrike.hullDamage
            if (defenderDestroyed) attackerXpGain += floor(defender.maxHealth * 0.5).toInt()
            if (!attackerDestroyed) attackerXpGain += 10
        }

        if (defenderStrike != null && defender.weapon != null) {
            defenderXpGain += defenderStrike.hullDamage
            if (attackerDestroyed) defenderXpGain += floor(attacker.maxHealth * 0.5).toInt()
            if (!defenderDestroyed) defenderXpGain += 10
        }

        val defenderTotalDamage = attackerStrike.shieldDamage + attackerStrike.hullDamage
        val attackerTotalDamage = (defenderStrike?.shieldDamage ?: 0) + (defenderStrike?.hullDamage ?: 0)

        return CombatResult(
            attackerDamage = attackerTotalDamage,
            defenderDamage = defenderTotalDamage,
            attackerShieldDamage = attackerShieldDmg,
            defenderShieldDamage = attackerStrike.shieldDamage,
            attackerDestroyed = attackerDestroyed,
            defenderDestroyed = defenderDestroyed,
            attackerXpGain = attackerXpGain,
            defenderXpGain = defenderXpGain,
            attackerStrike = attackerStrike,
            defenderStrike = defenderStrike,
        )
    }

    private fun resolveStrike(
        striker: UnitData,
        target: UnitData,
        rng: NoiseGenerator.SeededRNG,
        incomingDamageMul: Double = 1.0,
    ): StrikeResult {
        if (striker.weapon == null) {
            return StrikeResult(rawDamage = 0, shieldDamage = 0, hullDamage = 0, isCrit = false)
        }

        val vetBonus = VETERAN_BONUSES[striker.veteranTier]!!
        val weaponStats = WEAPON_STATS[striker.weapon]!!

        // 1. Base damage with vet multiplier
        var damage = striker.attack * vetBonus.attackMul

        // 2. Size factor: small targets take less, large take more
        val sizeFactor = when (target.size) {
            ShipSize.SMALL -> 0.75
            ShipSize.LARGE -> 1.25
            ShipSize.MEDIUM -> 1.0
        }

        // 3. Weapon size bonus
        val missileBonus = weaponStats.sizeBonus[target.size]!!
        damage *= missileBonus
        damage *= sizeFactor

        // 4. Crit check
        val critChance = 0.10 + vetBonus.critBonus
        val isCrit = rng.next() < critChance
        if (isCrit) {
            damage *= 1.5
        }

        // 5. Variance: +/-10%
        val variance = damage * 0.10 * (2 * rng.next() - 1)
        damage += variance

        // 5b. Influence multiplier
        damage *= incomingDamageMul

        // 6. Shield absorption -- laser deals bonus damage to shields
        val shieldDamage = minOf(ceil(damage * weaponStats.shieldBonus).toInt(), target.shields)
        var remaining = damage - (shieldDamage / weaponStats.shieldBonus)

        // 7. Armor reduction -- kinetic bypasses 25% of armor
        val effectiveArmor = target.armor * (1.0 - weaponStats.armorBypass)
        remaining = max(0.0, remaining - effectiveArmor)

        // 8. Minimum 1 hull damage if weapon is present
        val hullDamage = max(1, remaining.roundToInt())

        return StrikeResult(
            rawDamage = damage.roundToInt(),
            shieldDamage = shieldDamage,
            hullDamage = hullDamage,
            isCrit = isCrit,
        )
    }

    /** Check if XP warrants a promotion and return the new tier. */
    fun maybePromote(currentTier: VeteranTier, xp: Int): VeteranTier {
        if (xp >= VETERAN_XP_THRESHOLDS[VeteranTier.ADVANCED]!!) return VeteranTier.ADVANCED
        if (xp >= VETERAN_XP_THRESHOLDS[VeteranTier.IMPROVED]!!) return VeteranTier.IMPROVED
        return VeteranTier.STANDARD
    }

    /**
     * Resolve one-way combat: a unit attacks a building (no retaliation).
     * Buildings are treated as large targets with 0 armor.
     */
    fun resolveBuildingCombat(
        attacker: UnitData,
        building: BuildingData,
        seed: Int,
        incomingDamageMul: Double = 1.0,
    ): BuildingCombatResult {
        val rng = NoiseGenerator.seededRNG(seed)

        // Create a synthetic target with building stats
        val syntheticTarget = UnitData(
            id = building.id,
            name = building.type.id,
            ownerId = building.ownerId,
            type = UnitType.SCOUT, // unused, only size/armor/shields matter
            q = building.q,
            r = building.r,
            movementPoints = 0,
            maxMovementPoints = 0,
            health = building.health,
            maxHealth = building.maxHealth,
            attack = 0,
            defense = 0,
            range = 0,
            sightRange = 0,
            size = ShipSize.LARGE,
            weapon = null,
            armor = 0,
            shields = building.shields,
            maxShields = building.maxShields,
            xp = 0,
            veteranTier = VeteranTier.STANDARD,
            hasAttacked = false,
        )

        val strike = resolveStrike(attacker, syntheticTarget, rng, incomingDamageMul)

        val destroyed = (building.health - strike.hullDamage) <= 0

        var attackerXpGain = strike.hullDamage
        if (destroyed) attackerXpGain += floor(building.maxHealth * 0.5).toInt()
        attackerXpGain += 10 // survival bonus (attacker can't die attacking buildings)

        return BuildingCombatResult(
            damage = strike.shieldDamage + strike.hullDamage,
            shieldDamage = strike.shieldDamage,
            hullDamage = strike.hullDamage,
            destroyed = destroyed,
            attackerXpGain = attackerXpGain,
            strike = strike,
        )
    }
}
