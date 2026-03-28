package com.stellarhex.model

import com.fasterxml.jackson.annotation.JsonValue
import com.stellarhex.world.HexCoord
import kotlin.math.max

// ── Enums ────────────────────────────────────────────────────────────

enum class StellarObjectType(@JsonValue val id: String) {
    STAR("star"),
    PLANET("planet"),
    MOON("moon"),
    ASTEROID("asteroid"),
    ASTEROID_FIELD("asteroid_field"),
    COMET("comet"),
    NEBULA("nebula"),
    BLACK_HOLE("black_hole"),
    EMPTY("empty");

    companion object {
        private val byId = entries.associateBy { it.id }
        fun fromId(id: String): StellarObjectType =
            byId[id] ?: throw IllegalArgumentException("Unknown StellarObjectType: $id")
    }
}

enum class BuildingType(@JsonValue val id: String) {
    MINING_STATION("mining_station"),
    COLONY("colony"),
    SOLAR_COLLECTOR("solar_collector"),
    STARBASE("starbase"),
    RESEARCH_LAB("research_lab");

    companion object {
        private val byId = entries.associateBy { it.id }
        fun fromId(id: String): BuildingType =
            byId[id] ?: throw IllegalArgumentException("Unknown BuildingType: $id")
    }
}

enum class UnitType(@JsonValue val id: String) {
    SCOUT("scout"),
    FIGHTER("fighter"),
    CORVETTE("corvette"),
    FRIGATE("frigate"),
    CRUISER("cruiser"),
    BATTLESHIP("battleship"),
    COLONY_SHIP("colony_ship"),
    MINING_DRONE("mining_drone");

    companion object {
        private val byId = entries.associateBy { it.id }
        fun fromId(id: String): UnitType =
            byId[id] ?: throw IllegalArgumentException("Unknown UnitType: $id")
    }
}

enum class ShipSize(@JsonValue val id: String) {
    SMALL("small"),
    MEDIUM("medium"),
    LARGE("large");

    companion object {
        private val byId = entries.associateBy { it.id }
        fun fromId(id: String): ShipSize =
            byId[id] ?: throw IllegalArgumentException("Unknown ShipSize: $id")
    }
}

enum class WeaponType(@JsonValue val id: String) {
    LASER("laser"),
    KINETIC("kinetic"),
    MISSILE("missile");

    companion object {
        private val byId = entries.associateBy { it.id }
        fun fromId(id: String): WeaponType =
            byId[id] ?: throw IllegalArgumentException("Unknown WeaponType: $id")
    }
}

enum class VeteranTier(@JsonValue val id: String) {
    STANDARD("standard"),
    IMPROVED("improved"),
    ADVANCED("advanced");

    companion object {
        private val byId = entries.associateBy { it.id }
        fun fromId(id: String): VeteranTier =
            byId[id] ?: throw IllegalArgumentException("Unknown VeteranTier: $id")
    }
}

enum class TechBranch(@JsonValue val id: String) {
    SHIELDS("shields"),
    WEAPONS("weapons"),
    ARMOR("armor"),
    SYSTEMS("systems"),
    DRIVE("drive");

    companion object {
        private val byId = entries.associateBy { it.id }
        fun fromId(id: String): TechBranch =
            byId[id] ?: throw IllegalArgumentException("Unknown TechBranch: $id")
    }
}

enum class TechTier(val level: Int) {
    TIER_1(1),
    TIER_2(2),
    TIER_3(3);

    companion object {
        fun fromLevel(level: Int): TechTier = when (level) {
            1 -> TIER_1
            2 -> TIER_2
            3 -> TIER_3
            else -> throw IllegalArgumentException("Unknown TechTier level: $level")
        }
    }
}

enum class TechId(@JsonValue val id: String, val branch: TechBranch, val tier: TechTier) {
    SHIELDS_1("shields_1", TechBranch.SHIELDS, TechTier.TIER_1),
    SHIELDS_2("shields_2", TechBranch.SHIELDS, TechTier.TIER_2),
    SHIELDS_3("shields_3", TechBranch.SHIELDS, TechTier.TIER_3),
    WEAPONS_1("weapons_1", TechBranch.WEAPONS, TechTier.TIER_1),
    WEAPONS_2("weapons_2", TechBranch.WEAPONS, TechTier.TIER_2),
    WEAPONS_3("weapons_3", TechBranch.WEAPONS, TechTier.TIER_3),
    ARMOR_1("armor_1", TechBranch.ARMOR, TechTier.TIER_1),
    ARMOR_2("armor_2", TechBranch.ARMOR, TechTier.TIER_2),
    ARMOR_3("armor_3", TechBranch.ARMOR, TechTier.TIER_3),
    SYSTEMS_1("systems_1", TechBranch.SYSTEMS, TechTier.TIER_1),
    SYSTEMS_2("systems_2", TechBranch.SYSTEMS, TechTier.TIER_2),
    SYSTEMS_3("systems_3", TechBranch.SYSTEMS, TechTier.TIER_3),
    DRIVE_1("drive_1", TechBranch.DRIVE, TechTier.TIER_1),
    DRIVE_2("drive_2", TechBranch.DRIVE, TechTier.TIER_2),
    DRIVE_3("drive_3", TechBranch.DRIVE, TechTier.TIER_3);

    companion object {
        private val byId = entries.associateBy { it.id }
        fun fromId(id: String): TechId =
            byId[id] ?: throw IllegalArgumentException("Unknown TechId: $id")
    }
}

enum class AnomalyType(@JsonValue val id: String) {
    DERELICT_SHIP("derelict_ship"),
    RESOURCE_CACHE("resource_cache"),
    ALIEN_SIGNAL("alien_signal"),
    WORMHOLE("wormhole"),
    ANCIENT_RUINS("ancient_ruins");

    companion object {
        private val byId = entries.associateBy { it.id }
        fun fromId(id: String): AnomalyType =
            byId[id] ?: throw IllegalArgumentException("Unknown AnomalyType: $id")
    }
}

enum class ResourceKey(@JsonValue val id: String) {
    ENERGY("energy"),
    MINERALS("minerals"),
    ALLOYS("alloys"),
    CREDITS("credits");

    companion object {
        private val byId = entries.associateBy { it.id }
        fun fromId(id: String): ResourceKey =
            byId[id] ?: throw IllegalArgumentException("Unknown ResourceKey: $id")
    }
}

enum class VictoryReason(@JsonValue val id: String) {
    DOMINATION("domination"),
    ECONOMIC("economic");

    companion object {
        private val byId = entries.associateBy { it.id }
        fun fromId(id: String): VictoryReason =
            byId[id] ?: throw IllegalArgumentException("Unknown VictoryReason: $id")
    }
}

// ── Data Classes ─────────────────────────────────────────────────────

data class Resources(
    val energy: Int = 0,
    val minerals: Int = 0,
    val alloys: Int = 0,
    val credits: Int = 0,
)

data class BuildingStats(
    val cost: Resources,
    val maxHealth: Int,
    val maxShields: Int,
    val buildTurns: Int,
    val yield: Resources,
    val allowedHexTypes: List<StellarObjectType>,
    val sightRange: Int,
)

data class ProductionItem(
    val unitType: UnitType,
    val turnsRemaining: Int,
)

data class ResearchItem(
    val techId: TechId,
    val turnsRemaining: Int,
)

data class TechBonus(
    val shields: Int = 0,
    val attack: Int = 0,
    val armor: Int = 0,
    val sightRange: Int = 0,
    val maxMovementPoints: Int = 0,
)

data class TechDefinition(
    val id: TechId,
    val name: String,
    val branch: TechBranch,
    val tier: TechTier,
    val cost: Resources,
    val researchTurns: Int,
    val bonus: TechBonus,
)

data class WeaponStats(
    val shieldBonus: Double,
    val armorBypass: Double,
    val sizeBonus: Map<ShipSize, Double>,
)

data class VeteranBonus(
    val attackMul: Double,
    val defenseMul: Double,
    val critBonus: Double,
)

data class UnitStats(
    val maxMovementPoints: Int,
    val maxHealth: Int,
    val attack: Int,
    val defense: Int,
    val range: Int,
    val sightRange: Int,
    val cost: Resources,
    val size: ShipSize,
    val weapon: WeaponType?,
    val armor: Int,
    val maxShields: Int,
    val buildTurns: Int,
)

data class UnitData(
    val id: String,
    val name: String,
    val ownerId: String,
    val type: UnitType,
    val q: Int,
    val r: Int,
    val movementPoints: Int,
    val maxMovementPoints: Int,
    val health: Int,
    val maxHealth: Int,
    val attack: Int,
    val defense: Int,
    val range: Int,
    val sightRange: Int,
    val size: ShipSize,
    val weapon: WeaponType?,
    val armor: Int,
    val shields: Int,
    val maxShields: Int,
    val xp: Int,
    val veteranTier: VeteranTier,
    val hasAttacked: Boolean,
    val dockedAt: String? = null,
)

data class BuildingData(
    val id: String,
    val ownerId: String,
    val type: BuildingType,
    val q: Int,
    val r: Int,
    val health: Int,
    val maxHealth: Int,
    val shields: Int,
    val maxShields: Int,
    val productionQueue: List<ProductionItem>? = null,
    val researchQueue: List<ResearchItem>? = null,
    val dockedUnits: List<String>? = null,
)

data class DynamicObject(
    val id: String,
    val type: String,
    val q: Int,
    val r: Int,
    val velocity: HexCoord,
)

data class HexOverride(
    val q: Int,
    val r: Int,
    val change: String,
)

data class AnomalyInfo(
    val name: String,
    val reward: Resources,
)

data class Anomaly(
    val id: String,
    val type: AnomalyType,
    val q: Int,
    val r: Int,
)

data class TradeHub(
    val id: String,
    val q: Int,
    val r: Int,
    val stock: Resources,
)

data class GameOverState(
    val winnerId: String,
    val reason: VictoryReason,
)

data class PlayerState(
    val id: String,
    val name: String,
    val color: String,
    val resources: Resources,
    val isAI: Boolean,
    val exploredHexes: Set<String>,
    val homeBaseId: String? = null,
    val eliminated: Boolean,
    val researchedTechs: Set<TechId>,
)

data class GameState(
    val turn: Int,
    val currentPlayerIndex: Int,
    val players: List<PlayerState>,
    val units: Map<String, UnitData>,
    val buildings: Map<String, BuildingData>,
    val dynamicObjects: Map<String, DynamicObject>,
    val chunkOverrides: Map<String, List<HexOverride>>,
    val anomalies: Map<String, Anomaly>,
    val tradeHubs: Map<String, TradeHub>,
    val tradedThisTurn: Set<String>,
    val seed: Long,
    val gameOver: GameOverState? = null,
    val spectate: Boolean? = null,
)

// ── Constants ────────────────────────────────────────────────────────

val ZERO_RESOURCES = Resources()

val BUILDING_STATS: Map<BuildingType, BuildingStats> = mapOf(
    BuildingType.MINING_STATION to BuildingStats(
        cost = Resources(energy = 20, minerals = 5),
        maxHealth = 15, maxShields = 5, buildTurns = 1,
        yield = Resources(minerals = 3),
        allowedHexTypes = listOf(StellarObjectType.ASTEROID, StellarObjectType.ASTEROID_FIELD, StellarObjectType.PLANET, StellarObjectType.MOON),
        sightRange = 2,
    ),
    BuildingType.COLONY to BuildingStats(
        cost = Resources(energy = 30, alloys = 10),
        maxHealth = 30, maxShields = 10, buildTurns = 2,
        yield = Resources(alloys = 2, credits = 2),
        allowedHexTypes = listOf(StellarObjectType.PLANET),
        sightRange = 5,
    ),
    BuildingType.SOLAR_COLLECTOR to BuildingStats(
        cost = Resources(energy = 10, credits = 15),
        maxHealth = 10, maxShields = 3, buildTurns = 1,
        yield = Resources(energy = 4),
        allowedHexTypes = listOf(StellarObjectType.EMPTY, StellarObjectType.NEBULA),
        sightRange = 2,
    ),
    BuildingType.STARBASE to BuildingStats(
        cost = Resources(energy = 40, alloys = 20, credits = 20),
        maxHealth = 50, maxShields = 15, buildTurns = 3,
        yield = Resources(energy = 2, credits = 1),
        allowedHexTypes = listOf(StellarObjectType.EMPTY, StellarObjectType.NEBULA),
        sightRange = 5,
    ),
    BuildingType.RESEARCH_LAB to BuildingStats(
        cost = Resources(energy = 25, alloys = 10),
        maxHealth = 12, maxShields = 5, buildTurns = 2,
        yield = Resources(energy = 1, credits = 1),
        allowedHexTypes = listOf(StellarObjectType.NEBULA),
        sightRange = 4,
    ),
)

val TECH_TREE: Map<TechId, TechDefinition> = mapOf(
    TechId.SHIELDS_1 to TechDefinition(TechId.SHIELDS_1, "Improved Deflectors", TechBranch.SHIELDS, TechTier.TIER_1, Resources(energy = 30, credits = 15), 3, TechBonus(shields = 1)),
    TechId.SHIELDS_2 to TechDefinition(TechId.SHIELDS_2, "Hardened Barriers", TechBranch.SHIELDS, TechTier.TIER_2, Resources(energy = 50, credits = 30), 5, TechBonus(shields = 2)),
    TechId.SHIELDS_3 to TechDefinition(TechId.SHIELDS_3, "Quantum Shield Matrix", TechBranch.SHIELDS, TechTier.TIER_3, Resources(energy = 80, credits = 50), 8, TechBonus(shields = 3)),

    TechId.WEAPONS_1 to TechDefinition(TechId.WEAPONS_1, "Refined Targeting", TechBranch.WEAPONS, TechTier.TIER_1, Resources(energy = 30, alloys = 10), 3, TechBonus(attack = 1)),
    TechId.WEAPONS_2 to TechDefinition(TechId.WEAPONS_2, "Overcharged Capacitors", TechBranch.WEAPONS, TechTier.TIER_2, Resources(energy = 50, alloys = 20), 5, TechBonus(attack = 2)),
    TechId.WEAPONS_3 to TechDefinition(TechId.WEAPONS_3, "Particle Accelerators", TechBranch.WEAPONS, TechTier.TIER_3, Resources(energy = 80, alloys = 40), 8, TechBonus(attack = 3)),

    TechId.ARMOR_1 to TechDefinition(TechId.ARMOR_1, "Reinforced Plating", TechBranch.ARMOR, TechTier.TIER_1, Resources(energy = 25, alloys = 15), 3, TechBonus(armor = 1)),
    TechId.ARMOR_2 to TechDefinition(TechId.ARMOR_2, "Composite Alloys", TechBranch.ARMOR, TechTier.TIER_2, Resources(energy = 45, alloys = 30), 5, TechBonus(armor = 2)),
    TechId.ARMOR_3 to TechDefinition(TechId.ARMOR_3, "Nano-reactive Hull", TechBranch.ARMOR, TechTier.TIER_3, Resources(energy = 75, alloys = 50), 8, TechBonus(armor = 3)),

    TechId.SYSTEMS_1 to TechDefinition(TechId.SYSTEMS_1, "Long-range Sensors", TechBranch.SYSTEMS, TechTier.TIER_1, Resources(energy = 25, credits = 10), 3, TechBonus(sightRange = 1)),
    TechId.SYSTEMS_2 to TechDefinition(TechId.SYSTEMS_2, "Tachyon Scanners", TechBranch.SYSTEMS, TechTier.TIER_2, Resources(energy = 40, credits = 25), 5, TechBonus(sightRange = 1)),
    TechId.SYSTEMS_3 to TechDefinition(TechId.SYSTEMS_3, "Subspace Array", TechBranch.SYSTEMS, TechTier.TIER_3, Resources(energy = 65, credits = 45), 8, TechBonus(sightRange = 1)),

    TechId.DRIVE_1 to TechDefinition(TechId.DRIVE_1, "Ion Thrusters", TechBranch.DRIVE, TechTier.TIER_1, Resources(energy = 30, alloys = 10), 4, TechBonus(maxMovementPoints = 1)),
    TechId.DRIVE_2 to TechDefinition(TechId.DRIVE_2, "Fusion Drive", TechBranch.DRIVE, TechTier.TIER_2, Resources(energy = 55, alloys = 25), 6, TechBonus(maxMovementPoints = 1)),
    TechId.DRIVE_3 to TechDefinition(TechId.DRIVE_3, "Warp Coils", TechBranch.DRIVE, TechTier.TIER_3, Resources(energy = 90, alloys = 45), 9, TechBonus(maxMovementPoints = 1)),
)

val WEAPON_STATS: Map<WeaponType, WeaponStats> = mapOf(
    WeaponType.LASER to WeaponStats(
        shieldBonus = 1.25, armorBypass = 0.0,
        sizeBonus = mapOf(ShipSize.SMALL to 1.0, ShipSize.MEDIUM to 1.0, ShipSize.LARGE to 1.0),
    ),
    WeaponType.KINETIC to WeaponStats(
        shieldBonus = 1.0, armorBypass = 0.25,
        sizeBonus = mapOf(ShipSize.SMALL to 1.0, ShipSize.MEDIUM to 1.0, ShipSize.LARGE to 1.0),
    ),
    WeaponType.MISSILE to WeaponStats(
        shieldBonus = 1.0, armorBypass = 0.0,
        sizeBonus = mapOf(ShipSize.SMALL to 1.25, ShipSize.MEDIUM to 1.0, ShipSize.LARGE to 1.0),
    ),
)

val VETERAN_BONUSES: Map<VeteranTier, VeteranBonus> = mapOf(
    VeteranTier.STANDARD to VeteranBonus(attackMul = 1.0, defenseMul = 1.0, critBonus = 0.0),
    VeteranTier.IMPROVED to VeteranBonus(attackMul = 1.15, defenseMul = 1.1, critBonus = 0.05),
    VeteranTier.ADVANCED to VeteranBonus(attackMul = 1.3, defenseMul = 1.2, critBonus = 0.10),
)

val VETERAN_XP_THRESHOLDS: Map<VeteranTier, Int> = mapOf(
    VeteranTier.STANDARD to 0,
    VeteranTier.IMPROVED to 50,
    VeteranTier.ADVANCED to 150,
)

val UNIT_STATS: Map<UnitType, UnitStats> = mapOf(
    UnitType.SCOUT to UnitStats(
        maxMovementPoints = 4, maxHealth = 8, attack = 3, defense = 0, range = 2, sightRange = 4,
        cost = Resources(energy = 20, alloys = 5), size = ShipSize.SMALL, weapon = WeaponType.LASER,
        armor = 0, maxShields = 0, buildTurns = 2,
    ),
    UnitType.FIGHTER to UnitStats(
        maxMovementPoints = 3, maxHealth = 15, attack = 7, defense = 3, range = 2, sightRange = 2,
        cost = Resources(energy = 30, alloys = 15), size = ShipSize.SMALL, weapon = WeaponType.LASER,
        armor = 1, maxShields = 2, buildTurns = 2,
    ),
    UnitType.CORVETTE to UnitStats(
        maxMovementPoints = 3, maxHealth = 18, attack = 8, defense = 5, range = 2, sightRange = 2,
        cost = Resources(energy = 35, alloys = 18), size = ShipSize.SMALL, weapon = WeaponType.KINETIC,
        armor = 2, maxShields = 3, buildTurns = 2,
    ),
    UnitType.FRIGATE to UnitStats(
        maxMovementPoints = 2, maxHealth = 25, attack = 9, defense = 8, range = 3, sightRange = 3,
        cost = Resources(energy = 45, alloys = 25, credits = 10), size = ShipSize.MEDIUM, weapon = WeaponType.MISSILE,
        armor = 3, maxShields = 5, buildTurns = 3,
    ),
    UnitType.CRUISER to UnitStats(
        maxMovementPoints = 2, maxHealth = 30, attack = 12, defense = 12, range = 3, sightRange = 3,
        cost = Resources(energy = 50, alloys = 30, credits = 20), size = ShipSize.MEDIUM, weapon = WeaponType.LASER,
        armor = 4, maxShields = 8, buildTurns = 3,
    ),
    UnitType.BATTLESHIP to UnitStats(
        maxMovementPoints = 1, maxHealth = 50, attack = 18, defense = 18, range = 3, sightRange = 3,
        cost = Resources(energy = 80, alloys = 50, credits = 40), size = ShipSize.LARGE, weapon = WeaponType.KINETIC,
        armor = 6, maxShields = 12, buildTurns = 4,
    ),
    UnitType.COLONY_SHIP to UnitStats(
        maxMovementPoints = 2, maxHealth = 12, attack = 0, defense = 0, range = 0, sightRange = 2,
        cost = Resources(energy = 40, alloys = 20, credits = 30), size = ShipSize.MEDIUM, weapon = null,
        armor = 0, maxShields = 0, buildTurns = 2,
    ),
    UnitType.MINING_DRONE to UnitStats(
        maxMovementPoints = 2, maxHealth = 6, attack = 0, defense = 0, range = 0, sightRange = 1,
        cost = Resources(energy = 15, minerals = 10), size = ShipSize.SMALL, weapon = null,
        armor = 0, maxShields = 0, buildTurns = 2,
    ),
)

val UNIT_UPKEEP: Map<UnitType, Resources> = mapOf(
    UnitType.FIGHTER to Resources(energy = 2),
    UnitType.CORVETTE to Resources(energy = 3),
    UnitType.FRIGATE to Resources(energy = 4, credits = 1),
    UnitType.CRUISER to Resources(energy = 5, credits = 2),
    UnitType.BATTLESHIP to Resources(energy = 8, credits = 4),
    UnitType.COLONY_SHIP to Resources(energy = 3),
)

const val ECONOMIC_VICTORY_CREDITS = 500

val ANOMALY_REWARDS: Map<AnomalyType, AnomalyInfo> = mapOf(
    AnomalyType.DERELICT_SHIP to AnomalyInfo("Derelict Ship", Resources(alloys = 15, credits = 10)),
    AnomalyType.RESOURCE_CACHE to AnomalyInfo("Resource Cache", Resources(minerals = 20, energy = 10)),
    AnomalyType.ALIEN_SIGNAL to AnomalyInfo("Alien Signal", Resources(credits = 25)),
    AnomalyType.WORMHOLE to AnomalyInfo("Wormhole", Resources(energy = 30)),
    AnomalyType.ANCIENT_RUINS to AnomalyInfo("Ancient Ruins", Resources(alloys = 10, minerals = 10, credits = 10)),
)

val TRADE_HUB_STARTING_STOCK = Resources(energy = 50, minerals = 50, alloys = 30, credits = 20)
val TRADE_HUB_REPLENISH = Resources(energy = 5, minerals = 5, alloys = 3, credits = 2)
val TRADE_HUB_MAX_STOCK = Resources(energy = 100, minerals = 100, alloys = 60, credits = 40)

val TRADE_RATES: Map<ResourceKey, Map<ResourceKey, Double>> = mapOf(
    ResourceKey.ENERGY to mapOf(ResourceKey.MINERALS to 2.0, ResourceKey.ALLOYS to 3.0, ResourceKey.CREDITS to 4.0),
    ResourceKey.MINERALS to mapOf(ResourceKey.ENERGY to 2.0, ResourceKey.ALLOYS to 3.0, ResourceKey.CREDITS to 4.0),
    ResourceKey.ALLOYS to mapOf(ResourceKey.ENERGY to 0.5, ResourceKey.MINERALS to 0.5, ResourceKey.CREDITS to 2.0),
    ResourceKey.CREDITS to mapOf(ResourceKey.ENERGY to 0.33, ResourceKey.MINERALS to 0.33, ResourceKey.ALLOYS to 0.5),
)

private val UNIT_TYPE_PREFIX: Map<UnitType, String> = mapOf(
    UnitType.SCOUT to "SC",
    UnitType.FIGHTER to "FI",
    UnitType.CORVETTE to "CV",
    UnitType.FRIGATE to "FR",
    UnitType.CRUISER to "CR",
    UnitType.BATTLESHIP to "BS",
    UnitType.COLONY_SHIP to "CO",
    UnitType.MINING_DRONE to "MD",
)

val UNIT_TYPE_LABEL: Map<UnitType, String> = mapOf(
    UnitType.SCOUT to "Scout",
    UnitType.FIGHTER to "Fighter",
    UnitType.CORVETTE to "Corvette",
    UnitType.FRIGATE to "Frigate",
    UnitType.CRUISER to "Cruiser",
    UnitType.BATTLESHIP to "Battleship",
    UnitType.COLONY_SHIP to "Colony Ship",
    UnitType.MINING_DRONE to "Mining Drone",
)

// ── Utility Functions ────────────────────────────────────────────────

fun canAfford(resources: Resources, cost: Resources): Boolean =
    resources.energy >= cost.energy
        && resources.minerals >= cost.minerals
        && resources.alloys >= cost.alloys
        && resources.credits >= cost.credits

fun addResources(a: Resources, b: Resources): Resources = Resources(
    energy = a.energy + b.energy,
    minerals = a.minerals + b.minerals,
    alloys = a.alloys + b.alloys,
    credits = a.credits + b.credits,
)

fun subtractResources(a: Resources, b: Resources): Resources = Resources(
    energy = a.energy - b.energy,
    minerals = a.minerals - b.minerals,
    alloys = a.alloys - b.alloys,
    credits = a.credits - b.credits,
)

fun clampResources(r: Resources): Resources = Resources(
    energy = max(0, r.energy),
    minerals = max(0, r.minerals),
    alloys = max(0, r.alloys),
    credits = max(0, r.credits),
)

data class CostEntry(val key: String, val value: Int, val current: Int)

fun costEntries(cost: Resources, current: Resources = ZERO_RESOURCES): List<CostEntry> =
    buildList {
        if (cost.energy > 0) add(CostEntry("energy", cost.energy, current.energy))
        if (cost.minerals > 0) add(CostEntry("minerals", cost.minerals, current.minerals))
        if (cost.alloys > 0) add(CostEntry("alloys", cost.alloys, current.alloys))
        if (cost.credits > 0) add(CostEntry("credits", cost.credits, current.credits))
    }

/** Sum all bonuses from a set of researched techs. */
fun computeTechBonuses(researchedTechs: Set<TechId>): TechBonus {
    var shields = 0
    var attack = 0
    var armor = 0
    var sightRange = 0
    var maxMovementPoints = 0
    for (id in researchedTechs) {
        val def = TECH_TREE[id] ?: continue
        shields += def.bonus.shields
        attack += def.bonus.attack
        armor += def.bonus.armor
        sightRange += def.bonus.sightRange
        maxMovementPoints += def.bonus.maxMovementPoints
    }
    return TechBonus(shields, attack, armor, sightRange, maxMovementPoints)
}

/** Check whether a tech can be researched (prerequisite tier completed). */
fun canResearch(techId: TechId, researchedTechs: Set<TechId>): Boolean {
    val def = TECH_TREE[techId] ?: return false
    if (techId in researchedTechs) return false
    if (def.tier == TechTier.TIER_1) return true
    val prereqTier = TechTier.fromLevel(def.tier.level - 1)
    val prereqId = TechId.entries.find { it.branch == def.branch && it.tier == prereqTier }
        ?: return false
    return prereqId in researchedTechs
}

/** Generate a display name like "SC003" based on existing units of the same type. */
fun generateUnitName(type: UnitType, existingUnits: Map<String, UnitData>): String {
    val count = existingUnits.values.count { it.type == type }
    val num = (count + 1).toString().padStart(3, '0')
    return "${UNIT_TYPE_PREFIX[type]}$num"
}
