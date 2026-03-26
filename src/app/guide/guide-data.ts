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
      'Scouts are your eyes on the frontier — the fastest ship in the fleet.',
      '## Key Abilities',
      '• Collect anomalies by moving to the hex and using the Collect action',
      '• Required at a hex to build a Starbase',
      '• Highest base movement (4 MP)',
      '## Tips',
      '• Lightly armed — avoid direct combat with warships',
      '• Send Scouts ahead to reveal the map and claim anomalies early',
    ],
  },
  fighter: {
    summary: 'Light combat ship with laser weapons.',
    prose: [
      'Cheap, fast, and expendable. Fighters are the backbone of early fleets.',
      '## Strengths',
      '• Laser weapons deal 1.25x damage to shields',
      '• Low cost and upkeep — easy to mass-produce',
      '• Small size means they take only 0.75x damage',
      '## Weaknesses',
      '• Low health and armor',
      '• Reduced damage against other small targets (0.75x size factor)',
    ],
  },
  corvette: {
    summary: 'Fast attack ship with kinetic weapons that bypass armor.',
    prose: [
      'Corvettes swap lasers for kinetic rounds, punching through heavy armor.',
      '## Strengths',
      '• Kinetic weapons bypass 25% of target armor',
      '• More health and armor than Fighters',
      '• Same speed as Fighters (3 MP)',
      '## Best Against',
      '• Heavily armored targets like Cruisers and Battleships',
    ],
  },
  frigate: {
    summary: 'Medium warship with missile weapons effective against small targets.',
    prose: [
      'A versatile mid-game warship with extended range and solid defenses.',
      '## Strengths',
      '• Missiles deal 1.25x damage against small ships',
      '• Extended attack range (3 hexes)',
      '• Medium size — standard damage from all weapon types',
      '## Best Against',
      '• Scouts, Fighters, and Corvettes',
    ],
  },
  cruiser: {
    summary: 'Heavy warship with powerful laser weapons and strong shields.',
    prose: [
      'The most versatile capital ship — strong offense and defense in one hull.',
      '## Strengths',
      '• Laser weapons strip shields efficiently (1.25x)',
      '• Highest shield capacity of any medium ship',
      '• Good balance of attack, defense, and armor',
      '## Role',
      '• Frontline assault ship that can sustain prolonged engagements',
    ],
  },
  battleship: {
    summary: 'Massive warship with devastating kinetic weapons. Slow but powerful.',
    prose: [
      'The ultimate combat vessel. Devastating firepower, but very slow.',
      '## Strengths',
      '• Highest health, armor, and attack in the fleet',
      '• Kinetic weapons bypass 25% of armor',
      '• 12 max shields for staying power',
      '## Weaknesses',
      '• Only 1 base movement point — needs careful positioning',
      '• Highest upkeep cost (8 Energy, 4 Credits)',
      '• Large size means they take 1.25x damage from all attacks',
    ],
  },
  colony_ship: {
    summary: 'Unarmed transport that establishes colonies on planets. Consumed on use.',
    prose: [
      'Carries settlers to establish a Colony on a planet hex.',
      '## How It Works',
      '• Move to a planet hex, then use the Build action to create a Colony',
      '• The Colony Ship is consumed when the Colony is built',
      '## Important',
      '• No weapons — cannot attack or retaliate',
      '• Always escort Colony Ships with combat units',
    ],
  },
  mining_drone: {
    summary: 'Automated drone that extracts resources from the hex it occupies.',
    prose: [
      'A cheap, automated unit that passively extracts resources.',
      '## How It Works',
      '• Extracts resources from the hex it occupies each turn',
      '• Yield depends on the hex (minerals from asteroids, energy from stars, etc.)',
      '## Advantages',
      '• Zero upkeep — pure economic investment',
      '• No weapons, but very cheap to replace',
    ],
  },
};

// ── Building Descriptions ────────────────────────────────────────

const BUILDING_DESCRIPTIONS: Record<BuildingType, { summary: string; prose: string[] }> = {
  mining_station: {
    summary: 'Extracts minerals from asteroids, planets, and moons.',
    prose: [
      'Provides steady mineral income each turn.',
      '## Placement',
      '• Asteroids, asteroid fields, planets, and moons',
      '## Notes',
      '• Minerals are used to build Mining Drones and some structures',
    ],
  },
  colony: {
    summary: 'Planetary settlement that produces alloys and credits. Requires a Colony Ship.',
    prose: [
      'Your primary source of alloys and credits.',
      '## Requirements',
      '• Can only be built on planet hexes',
      '• Requires a Colony Ship at the hex (consumed on build)',
      '## Benefits',
      '• Largest influence radius of any building (sight range 5)',
      '• Key to territorial control and economic victory',
    ],
  },
  solar_collector: {
    summary: 'Harvests energy from space. Cheap and quick to build.',
    prose: [
      'The most efficient way to generate energy income.',
      '## Placement',
      '• Empty hexes and nebulae',
      '## Why Build',
      '• Lowest cost and fastest build time of any structure',
      '• Essential early-game investment to fuel fleet expansion',
    ],
  },
  starbase: {
    summary: 'Military station that produces units and projects power. Requires a Scout.',
    prose: [
      'Your production center — all ships are built here via the production queue.',
      '## Requirements',
      '• Requires a Scout at the target hex',
      '• First Starbase built becomes your Home Base',
      '## Features',
      '• Highest health and shields of any building',
      '• Generates energy and credits each turn',
    ],
  },
  research_lab: {
    summary: 'Conducts research to unlock technology upgrades. Must be built in nebulae.',
    prose: [
      'Unlocks technology upgrades from the tech tree.',
      '## How It Works',
      '• Each lab can research one technology at a time',
      '• Completed research applies permanent bonuses to all your units',
      '## Placement',
      '• Nebula hexes only',
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
        '## Properties',
        '• 1.25x damage to shields — best for stripping defenses',
        '• No armor bypass',
        '## Used By',
        '• Scouts, Fighters, and Cruisers',
      ],
    },
    kinetic: {
      summary: 'Ballistic weapon that bypasses 25% of target armor.',
      prose: [
        '## Properties',
        '• Bypasses 25% of target armor',
        '• Standard shield damage (1.0x)',
        '## Used By',
        '• Corvettes and Battleships',
        '## Best Against',
        '• Heavily armored ships like Cruisers and Battleships',
      ],
    },
    missile: {
      summary: 'Guided weapon that deals bonus damage to small targets.',
      prose: [
        '## Properties',
        '• 1.25x damage against small ships',
        '• Standard shield and armor performance',
        '## Used By',
        '• Frigates',
        '## Best Against',
        '• Scouts, Fighters, and Corvettes',
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
        `The ${formatLabel(branch)} branch has 3 tiers, researched in order.`,
        '## Rules',
        '• Each Research Lab can work on one tech at a time',
        '• Completed bonuses apply immediately to all your units',
        '• Tier 1 must be complete before starting Tier 2, etc.',
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
        '## How to Collect',
        '• Move a Scout to the anomaly hex',
        '• Use the Collect action to claim the reward',
        '• Each anomaly can only be collected once',
        '• Resources are added immediately',
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
        '## Attack Rules',
        '• Units can attack once per turn',
        '• Target must be within attack range',
        '• Attacker strikes first, then defender retaliates (if alive and in range)',
        '## Damage Formula',
        '• Base Attack × Veteran Multiplier × Weapon Bonus × Size Factor',
        '• 10% crit chance (higher with veterancy) — crits deal 1.5x',
        '• Final damage varies by ±10%',
        '## Size Factor',
        '• Small targets: 0.75x damage taken',
        '• Medium targets: 1.0x damage taken',
        '• Large targets: 1.25x damage taken',
        '## Damage Resolution',
        '• Shields absorb damage first (lasers deal 1.25x to shields)',
        '• Remaining damage is reduced by armor (kinetic bypasses 25%)',
        '• Minimum 1 hull damage per hit',
        '## Special Cases',
        '• Buildings: treated as large targets with 0 armor, cannot retaliate',
        '• Influence bonus: own territory = 0.9x incoming, enemy territory = 1.1x incoming',
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
        '## Resources',
        '• Energy — powers buildings and fleet upkeep',
        '• Minerals — used by Mining Drones and some structures',
        '• Alloys — required for ships and advanced buildings',
        '• Credits — key to economic victory (reach 500 to win)',
        '## Income Sources',
        '• Building yields (per turn)',
        '• Mining Drone extraction (from hex resources)',
        '## Upkeep',
        '• Deducted each turn for fleet maintenance',
        '• Larger ships cost more — watch the resource bar for red values',
        '## Attrition',
        '• If any resource goes negative: all your units take 2 damage',
        '• Resources are then clamped to 0',
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
        'Buildings project influence over nearby hexes based on their sight range.',
        '## Regeneration',
        '• Units in own influence (and not near enemies): +2 HP, +1 shields per turn',
        '• Makes holding territory valuable',
        '## Combat Modifiers',
        '• Own influence: 0.9x incoming damage (10% reduction)',
        '• Enemy influence: 1.1x incoming damage (10% increase)',
        '• Both modifiers can stack',
        '## Visibility',
        '• Press I to toggle the influence overlay',
        '• Press R to toggle the attack range overlay',
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
        `## Economic Victory`,
        `• First player to accumulate ${ECONOMIC_VICTORY_CREDITS} credits wins immediately`,
        '• Focus on Colonies and trade infrastructure',
        '## Domination Victory',
        '• Last player standing wins',
        '• A player is eliminated when they have no units AND no buildings',
        '## Elimination Rules',
        '• Checked after combat and at end of each turn',
        '• You survive as long as you have at least one building',
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
        '## End of Your Turn',
        '• Income — building yields and drone income added',
        '• Upkeep — fleet maintenance costs deducted',
        '• Attrition — if any resource is negative, all units take 2 damage',
        '• Clamp — resources set to at least 0',
        '• Influence Regen — units in own influence heal +2 HP, +1 shields',
        '• Production — queues advance, completed units spawn at Starbase',
        '• Research — queues advance, completed techs apply to all units',
        '## Start of Next Turn',
        '• Movement Refresh — all units regain full MP',
        '• Shield Regen — all units regenerate +1 shield (up to max)',
        '• Attack Reset — all units can attack again',
        '## End of Round',
        '• After all players act, comets advance one hex along their trajectory',
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
        '## Camera',
        '• WASD or Arrow keys — pan the viewport',
        '• Mouse wheel or +/- — zoom in and out',
        '## Selection',
        '• Left-click — select a hex, unit, or building',
        '• Tab / Shift+Tab — cycle through your units',
        '• Right-click — open context menu (move, attack, build)',
        '## Actions',
        '• B — open build menu at the selected hex',
        '• H — center camera on your home base',
        '• I — toggle influence overlay',
        '• R — toggle attack range overlay',
        '• G — open this guide',
        '## Other',
        '• Escape — close panels, deselect, or cancel action',
        '• Ctrl+Z / Cmd+Z — undo last action (not End Turn)',
        '• ? — keyboard shortcuts quick reference',
      ],
      links: [
        { id: 'selection', category: 'mechanics', label: 'Selection & Interaction' },
        { id: 'viewport', category: 'mechanics', label: 'Viewport & Camera' },
        { id: 'hud', category: 'mechanics', label: 'HUD Elements' },
      ],
    },
    {
      id: 'selection',
      category: 'mechanics' as GuideCategory,
      title: 'Selection & Interaction',
      summary: 'How to select units, buildings, and hexes, and what actions are available.',
      prose: [
        '## Selecting Units',
        '• Left-click a unit on the map to select it',
        '• The Unit Info Panel appears at the bottom center showing HP, shields, MP, attack, defense, and veteran status',
        '• Tab / Shift+Tab cycles through your units and centers the camera',
        '## Selecting Hexes',
        '• Left-click any hex to select it',
        '• The Hex Info Panel (bottom-left) shows the hex type, resources, and any units or buildings present',
        '• Selecting a hex with your Starbase opens the Production Menu',
        '• Selecting a hex with your Research Lab opens the Research Menu',
        '## Context Menu',
        '• Right-click a hex to open the context menu with available actions:',
        '• Move Here — move the selected unit to this hex',
        '• Attack — attack an enemy unit or building at this hex',
        '• Build — construct a building at this hex',
        '• Collect — collect an anomaly (Scout only)',
        '## Click Popup',
        '• Left-click a hex with a selected unit to see quick action options',
        '• Options depend on context: move, attack, select unit, or cancel waypoint',
        '## Deselection',
        '• Press Escape to deselect or close the current panel',
        '• Pressing Escape multiple times: closes popup → cancels waypoint → deselects all',
      ],
      links: [
        { id: 'controls', category: 'mechanics', label: 'Controls' },
        { id: 'hud', category: 'mechanics', label: 'HUD Elements' },
        { id: 'combat', category: 'mechanics', label: 'Combat' },
      ],
    },
    {
      id: 'viewport',
      category: 'mechanics' as GuideCategory,
      title: 'Viewport & Camera',
      summary: 'How to navigate the map, zoom, and understand what you see on the canvas.',
      prose: [
        '## Panning',
        '• WASD or Arrow keys to move the camera',
        '• The map is infinite — generated procedurally as you explore',
        '## Zooming',
        '• Mouse wheel to zoom in and out',
        '• + and - keys also work',
        '• Zoom follows the mouse cursor position',
        '## What You See',
        '• Hexagonal grid with stellar objects: stars, planets, moons, asteroids, nebulae, comets, and black holes',
        '• Your units and buildings are displayed on the hexes they occupy',
        '• Unexplored hexes are hidden in fog of war',
        '• Fog clears based on unit and building sight range',
        '## Overlays',
        '• Influence overlay (I key) — shows hexes under your control in teal',
        '• Attack range overlay (R key) — shows hexes your units can reach for attacks',
        '## Minimap',
        '• Bottom-left corner shows a minimap of explored territory',
        '• Click the minimap to quickly jump to a location',
      ],
      links: [
        { id: 'controls', category: 'mechanics', label: 'Controls' },
        { id: 'influence', category: 'mechanics', label: 'Influence' },
      ],
    },
    {
      id: 'hud',
      category: 'mechanics' as GuideCategory,
      title: 'HUD Elements',
      summary: 'Guide to every panel, bar, and overlay visible during gameplay.',
      prose: [
        '## Resource Bar (top-left)',
        '• Shows your current Energy, Minerals, Alloys, and Credits',
        '• Net income is displayed with +/- signs',
        '• Red values mean you are losing that resource each turn',
        '## Turn Controls (top-right)',
        '• Shows the current turn number',
        '• End Turn button advances to the next player',
        '• Disabled during game over',
        '## Toolbar (top-center)',
        '• Home — centers camera on your home Starbase',
        '• Influence — toggles the influence territory overlay',
        '• Attack Range — toggles the attack range overlay',
        '• Guide — opens this guide',
        '• ? — opens the keyboard shortcuts panel',
        '## Unit Info Panel (bottom-center)',
        '• Appears when a unit is selected',
        '• Shows name, type, HP bar, shields, MP, attack, defense, armor, weapon, range, XP, and veteran tier',
        '## Production Menu (left)',
        '• Appears when you select a hex with your Starbase',
        '• Queue units for production — shows cost, build time, and affordability',
        '• Production queue shows units currently being built',
        '## Research Menu (left)',
        '• Appears when you select a hex with your Research Lab',
        '• Queue technologies — shows cost, research time, and prerequisites',
        '## Hex Info Panel (bottom-left)',
        '• Shows details about the selected hex: type, resources, units, and buildings present',
        '• Collapsible — click the header to toggle',
        '## Unit List Panel (right)',
        '• Lists all your units with type, name, and location',
        '• Click a unit to select it and center the camera',
        '## Building List Panel (right)',
        '• Lists all your buildings with type and location',
        '• Click a building to select its hex and center the camera',
        '## Event Feed (bottom-right)',
        '• Scrolling feed of recent game events',
        '• Shows combat results, production completions, discoveries, and turn transitions',
        '## Event Log (bottom-right)',
        '• Full history of all events — collapsible panel below the feed',
        '## Minimap (bottom-left)',
        '• Overview of explored territory',
        '• Click to jump the camera to that location',
        '## Game Over Overlay',
        '• Appears when the game ends',
        '• Shows VICTORY or DEFEAT with the winning player and reason',
        '• Return to Menu button navigates back to the main menu',
      ],
      links: [
        { id: 'selection', category: 'mechanics', label: 'Selection & Interaction' },
        { id: 'controls', category: 'mechanics', label: 'Controls' },
        { id: 'economy', category: 'mechanics', label: 'Economy' },
      ],
    },
    {
      id: 'trading',
      category: 'mechanics' as GuideCategory,
      title: 'Trade Hubs',
      summary: 'Neutral trading posts where scouts can exchange resources.',
      prose: [
        'Trade Hubs are persistent neutral stations scattered across the map between star systems.',
        '## How to Trade',
        '• Move a Scout to a discovered Trade Hub hex',
        '• Right-click and select "Trade" to open the trade modal',
        '• Pick a resource to sell and a resource to buy',
        '• Set the amount and confirm the trade',
        '## Rules',
        '• Each player can trade at a given hub once per turn',
        '• Trade Hubs have their own stock — you can only buy what they have',
        '• When you sell resources, they go into the hub\'s stock',
        '• Hub stock replenishes each round (all players complete their turns)',
        '• Any player\'s scout can trade at any hub — they are neutral',
        '## Exchange Rates',
        '• Energy/Minerals are cheap to trade: 2:1 for each other, 3:1 for alloys, 4:1 for credits',
        '• Alloys are mid-tier: 0.5:1 for energy/minerals, 2:1 for credits',
        '• Credits are the most expensive: 0.33:1 for energy/minerals, 0.5:1 for alloys',
      ],
      links: [
        { id: 'economy', category: 'mechanics', label: 'Economy' },
        { id: 'scout', category: 'units', label: 'Scout' },
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
