import {
  BUILDING_STATS, BuildingType,
  UNIT_STATS, UnitType, UNIT_UPKEEP,
  WEAPON_STATS, WeaponType,
  TECH_TREE, TechBranch, TechId,
  ANOMALY_REWARDS, AnomalyType,
  VETERAN_BONUSES, VETERAN_XP_THRESHOLDS, VeteranTier,
  ECONOMIC_VICTORY_CREDITS,
  Resources,
} from '../models/game-state';

export type GuideCategory = 'units' | 'buildings' | 'weapons' | 'research' | 'anomalies' | 'mechanics';

export interface GuideLink {
  id: string;
  category: GuideCategory;
  label: string;
}

export interface GuideStatRow {
  cells: (string | number)[];
  linkId?: string;
  linkCategory?: GuideCategory;
}

export interface GuideStatTable {
  headers: string[];
  rows: GuideStatRow[];
}

export interface GuideEntry {
  id: string;
  category: GuideCategory;
  title: string;
  summary: string;
  prose?: string[];
  statTables?: GuideStatTable[];
  links?: GuideLink[];
}

// ── Helpers ──────────────────────────────────────────────────────

function formatLabel(id: string): string {
  return id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatCost(cost: Partial<Resources>): string {
  return Object.entries(cost)
    .filter(([, v]) => v != null && v > 0)
    .map(([k, v]) => `${v} ${k.charAt(0).toUpperCase() + k.slice(1)}`)
    .join(', ') || 'Free';
}

function formatYield(y: Partial<Resources>): string {
  return Object.entries(y)
    .filter(([, v]) => v != null && v > 0)
    .map(([k, v]) => `+${v} ${k.charAt(0).toUpperCase() + k.slice(1)}`)
    .join(', ') || 'None';
}

// ── Unit Descriptions ────────────────────────────────────────────

const UNIT_DESCRIPTIONS: Record<UnitType, { summary: string; prose: string[] }> = {
  scout: {
    summary: 'Fast reconnaissance ship that can collect anomalies.',
    prose: [
      'Scouts are your eyes on the frontier. With the highest base movement points of any ship, they excel at exploration and anomaly collection.',
      'Scouts can collect anomalies by moving to the same hex and using the Collect action. They are lightly armed and should avoid direct combat with dedicated warships.',
      'A Scout is required at a hex to build a Starbase there.',
    ],
  },
  fighter: {
    summary: 'Light combat ship with laser weapons.',
    prose: [
      'Fighters are the backbone of early fleets. They are cheap to produce and maintain, making them ideal for the first engagements.',
      'Armed with lasers, they deal bonus damage to shields. Their small size makes them harder to hit but also means they deal reduced damage to other small targets.',
    ],
  },
  corvette: {
    summary: 'Fast attack ship with kinetic weapons that bypass armor.',
    prose: [
      'Corvettes trade the Fighter\'s laser for kinetic weapons, which bypass 25% of target armor. This makes them effective against heavily armored targets.',
      'They have slightly more health and armor than Fighters while maintaining the same speed.',
    ],
  },
  frigate: {
    summary: 'Medium warship with missile weapons effective against small targets.',
    prose: [
      'Frigates carry missile weapons that deal 25% bonus damage against small ships like Scouts, Fighters, and Corvettes.',
      'With longer range (3 hexes) and solid defenses, Frigates are versatile mid-game warships. Their medium size means they take standard damage from all weapon types.',
    ],
  },
  cruiser: {
    summary: 'Heavy warship with powerful laser weapons and strong shields.',
    prose: [
      'Cruisers are the most versatile capital ship, combining strong offensive and defensive capabilities. Their lasers deal bonus damage to shields, making them excellent at breaking through defenses.',
      'With the highest shield capacity of any medium-sized ship, Cruisers can sustain prolonged engagements.',
    ],
  },
  battleship: {
    summary: 'Massive warship with devastating kinetic weapons. Slow but powerful.',
    prose: [
      'Battleships are the ultimate combat vessel. Their kinetic weapons bypass 25% of enemy armor, and their large size gives them the highest health and armor in the fleet.',
      'The tradeoff is speed — with only 1 base movement point, Battleships need escort and careful positioning. They also have the highest upkeep cost.',
      'As large targets, Battleships take 25% more damage from all attacks due to the size factor.',
    ],
  },
  colony_ship: {
    summary: 'Unarmed transport that establishes colonies on planets. Consumed on use.',
    prose: [
      'Colony Ships carry the settlers and equipment needed to establish a Colony on a planet hex. When you build a Colony, the Colony Ship at that hex is consumed.',
      'Colony Ships have no weapons and cannot attack or retaliate. Protect them with escorts.',
    ],
  },
  mining_drone: {
    summary: 'Automated drone that extracts resources from the hex it occupies.',
    prose: [
      'Mining Drones passively extract resources from the hex they are positioned on. The yield depends on the hex\'s natural resources (minerals from asteroids, energy from stars, etc.).',
      'Drones have no weapons and no upkeep cost, making them a pure economic investment.',
    ],
  },
};

// ── Building Descriptions ────────────────────────────────────────

const BUILDING_DESCRIPTIONS: Record<BuildingType, { summary: string; prose: string[] }> = {
  mining_station: {
    summary: 'Extracts minerals from asteroids, planets, and moons.',
    prose: [
      'Mining Stations provide a steady income of minerals each turn. They can be built on asteroids, asteroid fields, planets, and moons.',
      'Minerals are primarily used for producing Mining Drones and as a component in some building costs.',
    ],
  },
  colony: {
    summary: 'Planetary settlement that produces alloys and credits. Requires a Colony Ship.',
    prose: [
      'Colonies are your primary source of alloys and credits. They can only be built on planet hexes and require a Colony Ship at the hex (which is consumed).',
      'Colonies have the largest influence radius (sight range 5), making them key to territorial control.',
    ],
  },
  solar_collector: {
    summary: 'Harvests energy from space. Cheap and quick to build.',
    prose: [
      'Solar Collectors are the most efficient way to generate energy income. They can be built on empty hexes and nebulae.',
      'With the lowest cost and fastest build time, Solar Collectors are an essential early-game investment to fuel your fleet.',
    ],
  },
  starbase: {
    summary: 'Military station that produces units and projects power. Requires a Scout.',
    prose: [
      'Starbases are your production centers — all ships are built at Starbases via the production queue. They also generate a small income of energy and credits.',
      'Building a Starbase requires a Scout at the target hex. The first Starbase built becomes your Home Base.',
      'Starbases have the highest health and shields of any building, making them difficult to destroy.',
    ],
  },
  research_lab: {
    summary: 'Conducts research to unlock technology upgrades. Must be built in nebulae.',
    prose: [
      'Research Labs allow you to research technologies from the tech tree. Each lab has its own research queue and can research one technology at a time.',
      'Labs can only be built in nebula hexes. Technologies provide permanent stat bonuses to all your units.',
    ],
  },
};

// ── Builder Functions ────────────────────────────────────────────

function buildUnitEntries(): GuideEntry[] {
  return (Object.keys(UNIT_STATS) as UnitType[]).map(type => {
    const stats = UNIT_STATS[type];
    const upkeep = UNIT_UPKEEP[type];
    const desc = UNIT_DESCRIPTIONS[type];

    const statTable: GuideStatTable = {
      headers: ['Stat', 'Value'],
      rows: [
        { cells: ['Health', stats.maxHealth] },
        { cells: ['Attack', stats.attack] },
        { cells: ['Defense', stats.defense] },
        { cells: ['Armor', stats.armor] },
        { cells: ['Shields', stats.maxShields] },
        { cells: ['Range', stats.range] },
        { cells: ['Sight', stats.sightRange] },
        { cells: ['Movement', stats.maxMovementPoints] },
        { cells: ['Size', formatLabel(stats.size)] },
        { cells: ['Weapon', stats.weapon ? formatLabel(stats.weapon) : 'None'] },
        { cells: ['Cost', formatCost(stats.cost)] },
        { cells: ['Build Turns', stats.buildTurns] },
        { cells: ['Upkeep', upkeep ? formatCost(upkeep) : 'Free'] },
      ],
    };

    const links: GuideLink[] = [];
    if (stats.weapon) {
      links.push({ id: stats.weapon, category: 'weapons', label: `${formatLabel(stats.weapon)} Weapon` });
    }
    links.push({ id: 'combat', category: 'mechanics', label: 'Combat System' });

    return {
      id: type,
      category: 'units' as GuideCategory,
      title: formatLabel(type),
      summary: desc.summary,
      prose: desc.prose,
      statTables: [statTable],
      links,
    };
  });
}

function buildUnitComparisonTable(): GuideStatTable {
  return {
    headers: ['Unit', 'HP', 'Atk', 'Def', 'Armor', 'Shld', 'Rng', 'MP', 'Size', 'Weapon', 'Upkeep'],
    rows: (Object.keys(UNIT_STATS) as UnitType[]).map(type => {
      const s = UNIT_STATS[type];
      const upkeep = UNIT_UPKEEP[type];
      return {
        cells: [
          formatLabel(type), s.maxHealth, s.attack, s.defense, s.armor,
          s.maxShields, s.range, s.maxMovementPoints,
          s.size.charAt(0).toUpperCase(), s.weapon ? formatLabel(s.weapon) : '—',
          upkeep ? formatCost(upkeep) : 'Free',
        ],
        linkId: type,
        linkCategory: 'units' as GuideCategory,
      };
    }),
  };
}

function buildBuildingEntries(): GuideEntry[] {
  return (Object.keys(BUILDING_STATS) as BuildingType[]).map(type => {
    const stats = BUILDING_STATS[type];
    const desc = BUILDING_DESCRIPTIONS[type];

    const statTable: GuideStatTable = {
      headers: ['Stat', 'Value'],
      rows: [
        { cells: ['Health', stats.maxHealth] },
        { cells: ['Shields', stats.maxShields] },
        { cells: ['Cost', formatCost(stats.cost)] },
        { cells: ['Build Turns', stats.buildTurns] },
        { cells: ['Yield', formatYield(stats.yield)] },
        { cells: ['Sight Range', stats.sightRange] },
        { cells: ['Allowed Hexes', stats.allowedHexTypes.map(formatLabel).join(', ')] },
      ],
    };

    const links: GuideLink[] = [
      { id: 'economy', category: 'mechanics', label: 'Economy' },
      { id: 'influence', category: 'mechanics', label: 'Influence' },
    ];

    return {
      id: type,
      category: 'buildings' as GuideCategory,
      title: formatLabel(type),
      summary: desc.summary,
      prose: desc.prose,
      statTables: [statTable],
      links,
    };
  });
}

function buildBuildingComparisonTable(): GuideStatTable {
  return {
    headers: ['Building', 'HP', 'Shld', 'Cost', 'Turns', 'Yield', 'Sight', 'Hexes'],
    rows: (Object.keys(BUILDING_STATS) as BuildingType[]).map(type => {
      const s = BUILDING_STATS[type];
      return {
        cells: [
          formatLabel(type), s.maxHealth, s.maxShields,
          formatCost(s.cost), s.buildTurns, formatYield(s.yield),
          s.sightRange, s.allowedHexTypes.map(formatLabel).join(', '),
        ],
        linkId: type,
        linkCategory: 'buildings' as GuideCategory,
      };
    }),
  };
}

function buildWeaponEntries(): GuideEntry[] {
  const descriptions: Record<WeaponType, { summary: string; prose: string[] }> = {
    laser: {
      summary: 'Energy weapon that deals bonus damage to shields.',
      prose: [
        'Lasers deal 25% bonus damage when hitting shields, making them the best weapon for stripping enemy defenses. They have no armor bypass capability.',
        'Used by: Scouts, Fighters, and Cruisers.',
      ],
    },
    kinetic: {
      summary: 'Ballistic weapon that bypasses 25% of target armor.',
      prose: [
        'Kinetic weapons fire physical projectiles that partially penetrate armor plating. They bypass 25% of the target\'s armor value, making them effective against heavily armored ships.',
        'Used by: Corvettes and Battleships.',
      ],
    },
    missile: {
      summary: 'Guided weapon that deals bonus damage to small targets.',
      prose: [
        'Missiles have tracking systems that are most effective against small, agile targets. They deal 25% bonus damage to small-sized ships (Scouts, Fighters, Corvettes).',
        'Used by: Frigates.',
      ],
    },
  };

  return (Object.keys(WEAPON_STATS) as WeaponType[]).map(type => {
    const stats = WEAPON_STATS[type];
    const desc = descriptions[type];

    const statTable: GuideStatTable = {
      headers: ['Stat', 'Value'],
      rows: [
        { cells: ['Shield Bonus', `${stats.shieldBonus}x`] },
        { cells: ['Armor Bypass', `${Math.round(stats.armorBypass * 100)}%`] },
        { cells: ['vs Small', `${stats.sizeBonus.small}x`] },
        { cells: ['vs Medium', `${stats.sizeBonus.medium}x`] },
        { cells: ['vs Large', `${stats.sizeBonus.large}x`] },
      ],
    };

    // Link to units that use this weapon
    const unitLinks: GuideLink[] = (Object.keys(UNIT_STATS) as UnitType[])
      .filter(u => UNIT_STATS[u].weapon === type)
      .map(u => ({ id: u, category: 'units' as GuideCategory, label: formatLabel(u) }));

    return {
      id: type,
      category: 'weapons' as GuideCategory,
      title: formatLabel(type),
      summary: desc.summary,
      prose: desc.prose,
      statTables: [statTable],
      links: [...unitLinks, { id: 'combat', category: 'mechanics', label: 'Combat System' }],
    };
  });
}

function buildResearchEntries(): GuideEntry[] {
  const branches: TechBranch[] = ['shields', 'weapons', 'armor', 'systems', 'drive'];
  const branchDescriptions: Record<TechBranch, string> = {
    shields: 'Increases the maximum shields of all your units.',
    weapons: 'Increases the attack power of all your units.',
    armor: 'Increases the armor rating of all your units.',
    systems: 'Increases the sight range of all your units.',
    drive: 'Increases the movement points of all your units.',
  };

  return branches.map(branch => {
    const techs = ([1, 2, 3] as const).map(tier => TECH_TREE[`${branch}_${tier}` as TechId]);

    const statTable: GuideStatTable = {
      headers: ['Tier', 'Name', 'Bonus', 'Cost', 'Turns'],
      rows: techs.map(t => ({
        cells: [
          t.tier,
          t.name,
          Object.entries(t.bonus).map(([k, v]) => `+${v} ${formatLabel(k)}`).join(', '),
          formatCost(t.cost),
          t.researchTurns,
        ],
      })),
    };

    return {
      id: branch,
      category: 'research' as GuideCategory,
      title: `${formatLabel(branch)} Research`,
      summary: branchDescriptions[branch],
      prose: [
        `The ${formatLabel(branch)} research branch has 3 tiers. Each tier must be researched in order (Tier 1 before Tier 2, etc.).`,
        'Research is conducted at Research Labs. Each lab can research one technology at a time. When complete, the bonus is immediately applied to all your units.',
      ],
      statTables: [statTable],
      links: [{ id: 'research_lab', category: 'buildings', label: 'Research Lab' }],
    };
  });
}

function buildAnomalyEntries(): GuideEntry[] {
  return (Object.keys(ANOMALY_REWARDS) as AnomalyType[]).map(type => {
    const info = ANOMALY_REWARDS[type];
    return {
      id: type,
      category: 'anomalies' as GuideCategory,
      title: info.name,
      summary: `Grants ${formatCost(info.reward)} when collected by a Scout.`,
      prose: [
        'Anomalies are discovered as you explore the map. Send a Scout to the anomaly hex and use the Collect action to claim the reward.',
        'Each anomaly can only be collected once. Resources are added to your stockpile immediately.',
      ],
      links: [{ id: 'scout', category: 'units', label: 'Scout' }],
    };
  });
}

function buildAnomalyComparisonTable(): GuideStatTable {
  return {
    headers: ['Anomaly', 'Reward'],
    rows: (Object.keys(ANOMALY_REWARDS) as AnomalyType[]).map(type => {
      const info = ANOMALY_REWARDS[type];
      return {
        cells: [info.name, formatCost(info.reward)],
        linkId: type,
        linkCategory: 'anomalies' as GuideCategory,
      };
    }),
  };
}

function buildMechanicEntries(): GuideEntry[] {
  return [
    {
      id: 'combat',
      category: 'mechanics' as GuideCategory,
      title: 'Combat',
      summary: 'How attacks, damage, shields, armor, and veterancy work.',
      prose: [
        'Units can attack once per turn if they have a weapon and the target is within range. The attacker strikes first, then the defender retaliates if still alive, within range, and armed.',
        'Damage is calculated as: Base Attack x Veteran Multiplier x Weapon Size Bonus x Target Size Factor. A 10% crit chance (increased by veterancy) deals 1.5x damage. Final damage varies by +/-10%.',
        'Size Factor: Small targets take 0.75x damage. Medium targets take 1.0x. Large targets take 1.25x.',
        'Shields absorb damage first. Lasers deal 1.25x damage to shields. Remaining damage is reduced by armor (kinetic weapons bypass 25% of armor). Minimum 1 hull damage per hit.',
        'Buildings are treated as large targets with 0 armor. They cannot retaliate.',
        'Influence affects combat: units in their own influence take 0.9x damage. Units in enemy influence take 1.1x damage. These stack.',
      ],
      statTables: [
        {
          headers: ['Veteran Tier', 'XP Required', 'Attack Mult', 'Defense Mult', 'Crit Bonus'],
          rows: (Object.keys(VETERAN_BONUSES) as VeteranTier[]).map(tier => ({
            cells: [
              formatLabel(tier),
              VETERAN_XP_THRESHOLDS[tier],
              `${VETERAN_BONUSES[tier].attackMul}x`,
              `${VETERAN_BONUSES[tier].defenseMul}x`,
              `+${Math.round(VETERAN_BONUSES[tier].critBonus * 100)}%`,
            ],
          })),
        },
      ],
      links: [
        { id: 'laser', category: 'weapons', label: 'Laser' },
        { id: 'kinetic', category: 'weapons', label: 'Kinetic' },
        { id: 'missile', category: 'weapons', label: 'Missile' },
        { id: 'influence', category: 'mechanics', label: 'Influence' },
      ],
    },
    {
      id: 'economy',
      category: 'mechanics' as GuideCategory,
      title: 'Economy',
      summary: 'Resources, income, upkeep, and what happens when you go bankrupt.',
      prose: [
        'There are four resources: Energy, Minerals, Alloys, and Credits. Each has different sources and uses.',
        'Income comes from buildings (yield per turn) and Mining Drones (extract hex resources). Upkeep is deducted each turn for maintaining your fleet — larger ships cost more.',
        'If any resource drops below zero after income and upkeep, all your units take 2 damage (attrition). Resources are then clamped to zero.',
        'Net Income = Building Yields + Drone Income - Unit Upkeep. Watch your net income in the resource bar — red values mean you are losing resources each turn.',
      ],
      links: [
        { id: 'mining_station', category: 'buildings', label: 'Mining Station' },
        { id: 'solar_collector', category: 'buildings', label: 'Solar Collector' },
        { id: 'mining_drone', category: 'units', label: 'Mining Drone' },
        { id: 'turns', category: 'mechanics', label: 'Turn Flow' },
      ],
    },
    {
      id: 'influence',
      category: 'mechanics' as GuideCategory,
      title: 'Influence',
      summary: 'How buildings project control over nearby hexes, enabling regen and combat bonuses.',
      prose: [
        'Each building projects influence over nearby hexes based on its sight range. All hexes within that radius are considered under your influence.',
        'Units in your own influence that are NOT near any enemy unit regenerate +2 HP and +1 shields at the start of each turn. This makes holding territory valuable.',
        'In combat, units in their own influence take 10% less incoming damage (0.9x multiplier). Units in enemy influence take 10% more damage (1.1x multiplier). Both modifiers can apply simultaneously.',
        'Toggle the influence overlay with the I key to see your controlled territory. Toggle the attack range overlay with R to see your combat reach.',
      ],
      links: [
        { id: 'combat', category: 'mechanics', label: 'Combat' },
        { id: 'colony', category: 'buildings', label: 'Colony' },
        { id: 'starbase', category: 'buildings', label: 'Starbase' },
      ],
    },
    {
      id: 'victory',
      category: 'mechanics' as GuideCategory,
      title: 'Victory Conditions',
      summary: 'How to win the game — through economic dominance or military conquest.',
      prose: [
        `Economic Victory: The first player to accumulate ${ECONOMIC_VICTORY_CREDITS} credits wins immediately. Focus on building Colonies and trade infrastructure.`,
        'Domination Victory: If all other players are eliminated, the last player standing wins. A player is eliminated when they have no units AND no buildings remaining.',
        'Elimination is checked after combat and at the end of each turn. Even if you lose all your ships, you survive as long as you have at least one building.',
      ],
      links: [
        { id: 'economy', category: 'mechanics', label: 'Economy' },
        { id: 'combat', category: 'mechanics', label: 'Combat' },
      ],
    },
    {
      id: 'turns',
      category: 'mechanics' as GuideCategory,
      title: 'Turn Flow',
      summary: 'What happens each turn in order — income, upkeep, production, and more.',
      prose: [
        'When you end your turn, the following steps happen in order:',
        '1. Income: All building yields and drone income are added to your resources.',
        '2. Upkeep: Fleet maintenance costs are deducted.',
        '3. Attrition: If any resource is negative, all your units take 2 damage.',
        '4. Clamp: Resources are set to at least 0.',
        '5. Influence Regen: Units in own influence (not near enemies) heal +2 HP, +1 shields.',
        '6. Production: Building queues advance. Completed units spawn at their Starbase.',
        '7. Research: Research queues advance. Completed techs apply bonuses to all units.',
        'Then the next player\'s turn begins with:',
        '8. Movement Refresh: All units regain their full movement points.',
        '9. Shield Regen: All units regenerate +1 shield (up to max).',
        '10. Attack Reset: All units can attack again.',
        'After all players complete a round, comets advance one hex along their trajectory.',
      ],
      links: [
        { id: 'economy', category: 'mechanics', label: 'Economy' },
        { id: 'influence', category: 'mechanics', label: 'Influence' },
      ],
    },
    {
      id: 'controls',
      category: 'mechanics' as GuideCategory,
      title: 'Controls',
      summary: 'Keyboard shortcuts and mouse controls for playing the game.',
      prose: [
        'Camera: WASD or Arrow keys to pan. Mouse wheel or +/- to zoom.',
        'Selection: Click a hex to select it. Click a unit or building to view its info panel.',
        'Tab / Shift+Tab: Cycle through your units.',
        'B: Open the build menu when a valid hex is selected.',
        'H: Center the camera on your home base.',
        'I: Toggle the influence overlay showing your controlled territory.',
        'R: Toggle the attack range overlay showing hexes your units can reach.',
        'G: Open this guide.',
        'Escape: Close panels, deselect, or cancel the current action.',
        'Ctrl+Z / Cmd+Z: Undo the last action (cannot undo End Turn).',
        '?: Show the keyboard shortcuts quick reference.',
        'Right-click: Open the context menu for move, attack, and build options.',
      ],
    },
  ];
}

// ── Public API ───────────────────────────────────────────────────

export const GUIDE_ENTRIES: GuideEntry[] = [
  ...buildUnitEntries(),
  ...buildBuildingEntries(),
  ...buildWeaponEntries(),
  ...buildResearchEntries(),
  ...buildAnomalyEntries(),
  ...buildMechanicEntries(),
];

export const GUIDE_COMPARISON_TABLES: Partial<Record<GuideCategory, GuideStatTable>> = {
  units: buildUnitComparisonTable(),
  buildings: buildBuildingComparisonTable(),
  anomalies: buildAnomalyComparisonTable(),
};

export const GUIDE_CATEGORIES: { id: GuideCategory; title: string; description: string }[] = [
  { id: 'units', title: 'Units', description: 'Ships and drones you can build and command.' },
  { id: 'buildings', title: 'Buildings', description: 'Structures that generate income and project influence.' },
  { id: 'weapons', title: 'Weapons', description: 'Weapon types and their combat properties.' },
  { id: 'research', title: 'Research', description: 'Technology branches that upgrade your fleet.' },
  { id: 'anomalies', title: 'Anomalies', description: 'Discoverable objects that grant bonus resources.' },
  { id: 'mechanics', title: 'Mechanics', description: 'Core game rules: combat, economy, influence, and more.' },
];

export function getEntriesByCategory(category: GuideCategory): GuideEntry[] {
  return GUIDE_ENTRIES.filter(e => e.category === category);
}

export function getEntryById(category: GuideCategory, id: string): GuideEntry | undefined {
  return GUIDE_ENTRIES.find(e => e.category === category && e.id === id);
}

export function searchEntries(query: string): GuideEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return GUIDE_ENTRIES.filter(e =>
    e.title.toLowerCase().includes(q) ||
    e.summary.toLowerCase().includes(q)
  );
}
