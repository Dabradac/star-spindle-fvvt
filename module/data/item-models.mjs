import { SPINDLE } from "../config.mjs";

const { HTMLField, NumberField, SchemaField, StringField, BooleanField, SetField } = foundry.data.fields;

const L = key => `SPINDLE.Field.${key}`;

const int = (initial, label, options = {}) =>
  new NumberField({ required: true, nullable: false, integer: true, initial, label: L(label), ...options });

const num = (initial, label, options = {}) =>
  new NumberField({ required: true, nullable: false, initial, label: L(label), ...options });

const str = (label, options = {}) =>
  new StringField({ required: true, blank: true, label: L(label), ...options });

const bool = (initial, label) => new BooleanField({ initial, label: L(label) });

const bonusFields = () => ({
  modifier: int(0, "modifier"),
  bonusTarget: str("bonusTarget", { choices: SPINDLE.bonusTargets })
});

/* -------------------------------------------- */

class BaseItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return { description: new HTMLField({ label: L("description") }) };
  }
}

/**
 * Предметы, которые персонаж носит с собой: категория веса, количество,
 * качество (от −3 до +3), экипировка и хранение в каюте.
 */
class PhysicalItemData extends BaseItemData {
  static DEFAULT_SIZE = "standard";

  static defineSchema() {
    return {
      ...super.defineSchema(),
      quantity: int(1, "quantity", { min: 0 }),
      size: str("size", { choices: SPINDLE.sizeChoices, initial: this.DEFAULT_SIZE, blank: false }),
      quality: int(0, "quality", { min: -3, max: 3 }),
      price: int(0, "price", { min: 0 }),
      equipped: bool(false, "equipped"),
      stored: bool(false, "stored")
    };
  }
}

/* -------------------------------------------- */

export class WeaponData extends PhysicalItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      skill: str("skill", { choices: SPINDLE.weaponSkills, initial: "shooting", blank: false }),
      modifier: int(0, "modifier"),
      initiative: int(0, "initiative"),
      damage: int(1, "damage", { min: 0 }),
      crit: int(2, "crit", { min: 0 }),
      range: str("range", { choices: SPINDLE.rangeChoices, initial: "medium", blank: false }),
      armorPiercing: int(0, "armorPiercing", { min: 0 }),
      automatic: bool(false, "automatic"),
      properties: str("properties"),
      ammo: new SchemaField({
        value: int(0, "ammoValue", { min: 0 }),
        max: int(0, "ammoMax", { min: 0 })
      })
    };
  }

  get isMelee() {
    return this.skill !== "shooting";
  }
}

export class ArmorData extends PhysicalItemData {
  static DEFAULT_SIZE = "light";

  static defineSchema() {
    return {
      ...super.defineSchema(),
      defense: int(1, "defense", { min: 0 }),
      properties: str("properties")
    };
  }
}

export class GearData extends PhysicalItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      ...bonusFields()
    };
  }
}

/** Имплант, протез или киберимплант. */
export class ImplantData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      kind: str("implantKind", { choices: SPINDLE.implantKinds, initial: "cyber", blank: false }),
      illegal: bool(false, "illegal"),
      price: int(0, "price", { min: 0 }),
      ...bonusFields()
    };
  }
}

/**
 * Особая способность от навыка. На каждом уровне навыка выбирается одна из двух.
 * Активные способности (*) стоят 1 Волю и дают Мастеру жетон Чернобога.
 */
export class AbilityData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      skill: str("abilitySkill", { choices: SPINDLE.skillChoices, initial: "melee", blank: false }),
      tier: int(1, "tier", { min: 1, max: 5 }),
      active: bool(false, "active"),
      used: bool(false, "used"),
      ...bonusFields()
    };
  }
}

/**
 * Черта персонажа: положительная или отрицательная.
 * Активация положительной черты даёт Мастеру жетон Чернобога,
 * активация отрицательной стоит Мастеру один жетон.
 */
export class TraitData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      kind: str("traitKind", { choices: SPINDLE.traitKinds, initial: "positive", blank: false }),
      craft: bool(false, "craft"),
      level: int(1, "craftLevel", { min: 1, max: 5 }),
      ...bonusFields()
    };
  }
}

/** Специализация (класс) персонажа. */
export class SpecializationData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      variations: str("variations"),
      recommendedSkills: new SetField(new StringField({ choices: SPINDLE.skillChoices }), {
        label: L("recommendedSkills")
      }),
      reputationModifier: int(0, "reputationModifier"),
      xpActions: str("xpActions"),
      traitExamples: str("traitExamples"),
      startingGear: str("startingGear")
    };
  }
}

/** Травма, болезнь, проклятие или иное состояние. */
export class InjuryData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      code: str("injuryCode"),
      lethal: bool(false, "lethal"),
      deadline: str("deadline"),
      effect: str("effect"),
      period: str("period"),
      strength: int(0, "strength", { min: 0 })
    };
  }
}

/* -------------------------------------------- */
/*  Предметы корабля                            */
/* -------------------------------------------- */

export class ShipWeaponData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      modifier: int(0, "modifier"),
      damage: int(1, "damage", { min: 0 }),
      crit: int(2, "crit", { min: 0 }),
      range: str("range", { choices: SPINDLE.shipRangeChoices, initial: "medium", blank: false }),
      damageType: str("damageType", { choices: SPINDLE.shipDamageTypes, initial: "structural", blank: false }),
      ignoresArmor: bool(false, "ignoresArmor"),
      location: str("location", { choices: SPINDLE.weaponLocations, initial: "bow", blank: false }),
      properties: str("properties"),
      price: int(0, "price", { min: 0 }),
      ammo: new SchemaField({
        value: int(0, "ammoValue", { min: 0 }),
        max: int(0, "ammoMax", { min: 0 })
      })
    };
  }
}

export class ShipModuleData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      category: str("moduleCategory", { choices: SPINDLE.moduleCategories, initial: "base", blank: false }),
      state: str("moduleState", { choices: SPINDLE.moduleStateChoices, initial: "normal", blank: false }),
      upgrades: str("moduleUpgrades")
    };
  }
}

export class ShipUpgradeData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      costPercent: int(0, "costPercent", { min: 0 })
    };
  }
}

export class CargoData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      quantity: int(1, "quantity", { min: 0 }),
      weight: num(0, "weightTons", { min: 0 }),
      storage: str("storage")
    };
  }
}
