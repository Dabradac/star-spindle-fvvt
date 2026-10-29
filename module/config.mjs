/**
 * Константы системы «Звёздное Веретено».
 */
export const SYSTEM_ID = "star-spindle";

export const SPINDLE = {};

/** Характеристики персонажа (от 1 до 5). */
SPINDLE.attributes = {
  body: "SPINDLE.Attribute.body",
  agility: "SPINDLE.Attribute.agility",
  intellect: "SPINDLE.Attribute.intellect",
  empathy: "SPINDLE.Attribute.empathy"
};

/**
 * Навыки: связанная характеристика и признак профессионального навыка.
 * Профессиональный навык нельзя проверять, если он не изучен хотя бы на 1.
 */
SPINDLE.skills = {
  melee: { attribute: "body", professional: false, label: "SPINDLE.Skill.melee" },
  strength: { attribute: "body", professional: false, label: "SPINDLE.Skill.strength" },
  shooting: { attribute: "agility", professional: false, label: "SPINDLE.Skill.shooting" },
  dexterity: { attribute: "agility", professional: false, label: "SPINDLE.Skill.dexterity" },
  stealth: { attribute: "agility", professional: false, label: "SPINDLE.Skill.stealth" },
  piloting: { attribute: "agility", professional: true, label: "SPINDLE.Skill.piloting" },
  observation: { attribute: "intellect", professional: false, label: "SPINDLE.Skill.observation" },
  survival: { attribute: "intellect", professional: false, label: "SPINDLE.Skill.survival" },
  cybershamanism: { attribute: "intellect", professional: true, label: "SPINDLE.Skill.cybershamanism" },
  mechanics: { attribute: "intellect", professional: true, label: "SPINDLE.Skill.mechanics" },
  science: { attribute: "intellect", professional: true, label: "SPINDLE.Skill.science" },
  healing: { attribute: "intellect", professional: true, label: "SPINDLE.Skill.healing" },
  influence: { attribute: "empathy", professional: false, label: "SPINDLE.Skill.influence" },
  leadership: { attribute: "empathy", professional: true, label: "SPINDLE.Skill.leadership" },
  culture: { attribute: "empathy", professional: true, label: "SPINDLE.Skill.culture" },
  witchcraft: { attribute: "empathy", professional: true, label: "SPINDLE.Skill.witchcraft" }
};

SPINDLE.skillChoices = () => Object.fromEntries(
  Object.entries(SPINDLE.skills).map(([k, v]) => [k, v.label])
);

/** Модификаторы сложности проверки. */
SPINDLE.difficulties = [
  { value: 3, label: "SPINDLE.Difficulty.elementary" },
  { value: 2, label: "SPINDLE.Difficulty.simple" },
  { value: 1, label: "SPINDLE.Difficulty.easy" },
  { value: 0, label: "SPINDLE.Difficulty.standard" },
  { value: -1, label: "SPINDLE.Difficulty.tricky" },
  { value: -2, label: "SPINDLE.Difficulty.hard" },
  { value: -3, label: "SPINDLE.Difficulty.extreme" }
];

/** Результат проверки по количеству успехов. */
SPINDLE.outcomes = [
  { min: 3, key: "brilliant" },
  { min: 2, key: "success" },
  { min: 1, key: "partial" },
  { min: 0, key: "failure" },
  { min: -Infinity, key: "fumble" }
];

/** Таблица опыта: индекс — уровень, значение — требуемый опыт. */
SPINDLE.xpTable = [null, 0, 10, 20, 40, 60, 90, 120, 150, 180, 220,
  260, 300, 350, 400, 450, 500, 550, 610, 670, 730];

/**
 * Категории веса предметов в ячейках снаряжения.
 * step — порядок категорий: надетая броня и одно оружие опускаются на шаг легче.
 */
SPINDLE.sizes = {
  small: { label: "SPINDLE.Size.small", slots: 0, step: 0 },
  light: { label: "SPINDLE.Size.light", slots: 0.5, step: 1 },
  standard: { label: "SPINDLE.Size.standard", slots: 1, step: 2 },
  heavy: { label: "SPINDLE.Size.heavy", slots: 2, step: 3 },
  bulky: { label: "SPINDLE.Size.bulky", slots: 4, step: 4 }
};
SPINDLE.sizeChoices = () => Object.fromEntries(Object.entries(SPINDLE.sizes).map(([k, v]) => [k, v.label]));
SPINDLE.sizeByStep = step => Object.entries(SPINDLE.sizes).find(([, v]) => v.step === step)?.[0] ?? "small";

/** Покровители персонажа. Атеисты не могут молиться. */
SPINDLE.religions = {
  rod: "SPINDLE.God.rod",
  perun: "SPINDLE.God.perun",
  dazhdbog: "SPINDLE.God.dazhdbog",
  svarog: "SPINDLE.God.svarog",
  yarilo: "SPINDLE.God.yarilo",
  stribog: "SPINDLE.God.stribog",
  lada: "SPINDLE.God.lada",
  khors: "SPINDLE.God.khors",
  morena: "SPINDLE.God.morena",
  single: "SPINDLE.God.single",
  atheist: "SPINDLE.God.atheist"
};

/** Происхождение персонажа. */
SPINDLE.origins = {
  commoner: "SPINDLE.Origin.commoner",
  townsfolk: "SPINDLE.Origin.townsfolk",
  noble: "SPINDLE.Origin.noble"
};

/** Фракции, с которыми у группы есть отношения. */
SPINDLE.factions = {
  demos: "SPINDLE.Faction.demos",
  commune: "SPINDLE.Faction.commune",
  peddlers: "SPINDLE.Faction.peddlers",
  frontiers: "SPINDLE.Faction.frontiers",
  church: "SPINDLE.Faction.church",
  outcasts: "SPINDLE.Faction.outcasts"
};

/** Кланы. */
SPINDLE.clans = {
  wolf: "SPINDLE.Clan.wolf",
  eagle: "SPINDLE.Clan.eagle",
  snake: "SPINDLE.Clan.snake",
  ram: "SPINDLE.Clan.ram",
  owl: "SPINDLE.Clan.owl",
  bear: "SPINDLE.Clan.bear"
};

/** Ремесленные ресурсы I–V. */
SPINDLE.resourceTiers = { t1: "I", t2: "II", t3: "III", t4: "IV", t5: "V" };

/* -------------------------------------------- */
/*  Оружие и бой                                */
/* -------------------------------------------- */

/** Навыки, которыми атакуют оружием. Сила — для метания. */
SPINDLE.weaponSkills = {
  melee: "SPINDLE.Skill.melee",
  shooting: "SPINDLE.Skill.shooting",
  strength: "SPINDLE.Skill.strength"
};

/** Дистанции наземного боя и модификаторы стрельбы. */
SPINDLE.ranges = {
  pointBlank: { label: "SPINDLE.Range.pointBlank", mod: 2, step: 0 },
  close: { label: "SPINDLE.Range.close", mod: 1, step: 1 },
  medium: { label: "SPINDLE.Range.medium", mod: 0, step: 2 },
  long: { label: "SPINDLE.Range.long", mod: -1, step: 3 },
  extreme: { label: "SPINDLE.Range.extreme", mod: -2, step: 4 }
};
SPINDLE.rangeChoices = () => Object.fromEntries(Object.entries(SPINDLE.ranges).map(([k, v]) => [k, v.label]));

/** Виды атак и их модификаторы. */
SPINDLE.attackModes = {
  melee: {
    normal: { label: "SPINDLE.Attack.normal", mod: 0 },
    quick: { label: "SPINDLE.Attack.quick", mod: -2 },
    power: { label: "SPINDLE.Attack.power", mod: 2 },
    opportunity: { label: "SPINDLE.Attack.opportunity", mod: -2 },
    choke: { label: "SPINDLE.Attack.choke", mod: 2 }
  },
  ranged: {
    normal: { label: "SPINDLE.Attack.shot", mod: 0 },
    hip: { label: "SPINDLE.Attack.hip", mod: -2 },
    aimed: { label: "SPINDLE.Attack.aimed", mod: 2 },
    auto: { label: "SPINDLE.Attack.auto", mod: -2 },
    braced: { label: "SPINDLE.Attack.braced", mod: 1 }
  },
  ship: {
    standard: { label: "SPINDLE.Attack.shipStandard", mod: 0 },
    aimed: { label: "SPINDLE.Attack.shipAimed", mod: 2 },
    quick: { label: "SPINDLE.Attack.shipQuick", mod: -2 },
    burst: { label: "SPINDLE.Attack.shipBurst", mod: -2 },
    volley: { label: "SPINDLE.Attack.shipVolley", mod: -3 }
  }
};

/* -------------------------------------------- */
/*  Корабли                                     */
/* -------------------------------------------- */

SPINDLE.shipClasses = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V" };

/** Атрибуты корабля с текущим и максимальным значением. */
SPINDLE.shipAttributes = {
  durability: "SPINDLE.Ship.Attribute.durability",
  energy: "SPINDLE.Ship.Attribute.energy",
  maneuverability: "SPINDLE.Ship.Attribute.maneuverability",
  signature: "SPINDLE.Ship.Attribute.signature",
  armor: "SPINDLE.Ship.Attribute.armor",
  speed: "SPINDLE.Ship.Attribute.speed",
  fuel: "SPINDLE.Ship.Attribute.fuel"
};

/** Системы, на которые бортинженер распределяет энергию, и навыки, которые они усиливают. */
SPINDLE.energySystems = {
  weapons: { label: "SPINDLE.Energy.weapons", skills: ["shooting"] },
  engines: { label: "SPINDLE.Energy.engines", skills: ["piloting"] },
  repair: { label: "SPINDLE.Energy.repair", skills: ["mechanics"] },
  sensors: { label: "SPINDLE.Energy.sensors", skills: ["science", "observation"] },
  cyber: { label: "SPINDLE.Energy.cyber", skills: ["cybershamanism"] }
};

/** Роли экипажа в космическом бою. */
SPINDLE.crewRoles = {
  "": "SPINDLE.None",
  captain: "SPINDLE.Crew.Roles.captain",
  pilot: "SPINDLE.Crew.Roles.pilot",
  engineer: "SPINDLE.Crew.Roles.engineer",
  targeter: "SPINDLE.Crew.Roles.targeter",
  gunner: "SPINDLE.Crew.Roles.gunner",
  cybershaman: "SPINDLE.Crew.Roles.cybershaman",
  passenger: "SPINDLE.Crew.Roles.passenger"
};

/** Навык по умолчанию для каждой роли. */
SPINDLE.crewRoleSkills = {
  captain: "leadership",
  pilot: "piloting",
  engineer: "mechanics",
  targeter: "observation",
  gunner: "shooting",
  cybershaman: "cybershamanism"
};

/** Дистанции космического боя (в сегментах) и модификаторы стрельбы. */
SPINDLE.shipRanges = {
  zero: { label: "SPINDLE.ShipRange.zero", mod: 2, step: 0 },
  close: { label: "SPINDLE.ShipRange.close", mod: 1, step: 1 },
  medium: { label: "SPINDLE.ShipRange.medium", mod: 0, step: 2 },
  long: { label: "SPINDLE.ShipRange.long", mod: -1, step: 3 },
  extreme: { label: "SPINDLE.ShipRange.extreme", mod: -3, step: 4 }
};
SPINDLE.shipRangeChoices = () => Object.fromEntries(Object.entries(SPINDLE.shipRanges).map(([k, v]) => [k, v.label]));

SPINDLE.shipDamageTypes = {
  structural: "SPINDLE.ShipDamage.structural",
  system: "SPINDLE.ShipDamage.system",
  both: "SPINDLE.ShipDamage.both"
};

SPINDLE.weaponLocations = {
  bow: "SPINDLE.Location.bow",
  stern: "SPINDLE.Location.stern",
  port: "SPINDLE.Location.port",
  starboard: "SPINDLE.Location.starboard",
  turret: "SPINDLE.Location.turret"
};

/** Состояние модульного отсека и штраф к связанным проверкам. */
SPINDLE.moduleStates = {
  normal: { label: "SPINDLE.Module.State.normal", mod: 0 },
  glitch: { label: "SPINDLE.Module.State.glitch", mod: -1 },
  broken: { label: "SPINDLE.Module.State.broken", mod: -2 },
  critical: { label: "SPINDLE.Module.State.critical", mod: -3 }
};
SPINDLE.moduleStateChoices = () => Object.fromEntries(Object.entries(SPINDLE.moduleStates).map(([k, v]) => [k, v.label]));

SPINDLE.moduleCategories = {
  base: "SPINDLE.Module.Category.base",
  extra: "SPINDLE.Module.Category.extra"
};

SPINDLE.traitKinds = {
  positive: "SPINDLE.Trait.positive",
  negative: "SPINDLE.Trait.negative"
};

SPINDLE.implantKinds = {
  implant: "SPINDLE.Implant.implant",
  prosthesis: "SPINDLE.Implant.prosthesis",
  cyber: "SPINDLE.Implant.cyber"
};

SPINDLE.dangerRatings = { 1: "1", 2: "2", 3: "3" };

/** Варианты цели для бонусов предметов. */
SPINDLE.bonusTargets = () => {
  const targets = { "": "SPINDLE.None", checks: "SPINDLE.AllChecks" };
  for (const [k, v] of Object.entries(SPINDLE.skills)) targets[`skill.${k}`] = v.label;
  return targets;
};

/**
 * Таблицы бросков, которые можно привязать в настройках мира, и кубы для них.
 * к66 — десятки и единицы двумя к6, к6 — один куб.
 */
SPINDLE.rollTables = {
  injury: "d66",
  shipCrit: "d66",
  compartment: "d66",
  jump: "d66",
  wear: "d6",
  vehicleCrit: "d6"
};
