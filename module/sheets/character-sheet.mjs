import { SPINDLE } from "../config.mjs";
import { SpindleActorSheet, templatePath } from "./base-actor-sheet.mjs";

const ABILITY_TIERS = [1, 2, 3, 4, 5];

/** Краткое описание предмета без разметки — для строк черт. */
export function summarize(html, length = 140) {
  const plain = (html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&laquo;/g, "«").replace(/&raquo;/g, "»").replace(/\s+/g, " ").trim();
  return plain.length > length ? `${plain.slice(0, length - 1).trimEnd()}…` : plain;
}

/**
 * Строки таблицы «Характеристика — навыки» для листов персонажа и НИП.
 * Если переданы особые способности, у каждого навыка появляются клетки уровней 1–5, как в листе из книги.
 */
export function prepareAttributeRows(system, abilities) {
  return Object.entries(SPINDLE.attributes).map(([key, label]) => ({
    key, label,
    value: system._source.attributes[key].value,
    effective: system.attributes[key].value,
    skills: Object.entries(SPINDLE.skills)
      .filter(([, cfg]) => cfg.attribute === key)
      .map(([skillKey, cfg]) => ({
        key: skillKey,
        label: cfg.label,
        professional: cfg.professional,
        value: system._source.skills[skillKey].value,
        bonus: system.skills[skillKey].bonus,
        total: system.skills[skillKey].total,
        untrained: cfg.professional && !system.skills[skillKey].value,
        tiers: abilities && ABILITY_TIERS.map(tier => ({
          tier,
          items: abilities.filter(a => (a.system.skill === skillKey) && (a.system.tier === tier))
        }))
      }))
  }));
}

/** Особые способности, упорядоченные по навыку и уровню. */
export function prepareAbilities(items) {
  const order = Object.keys(SPINDLE.skills);
  return (items ?? []).toSorted((a, b) =>
    (order.indexOf(a.system.skill) - order.indexOf(b.system.skill)) || (a.system.tier - b.system.tier)
  ).map(item => ({ item, skillLabel: SPINDLE.skills[item.system.skill]?.label }));
}

export class CharacterSheet extends SpindleActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["character"],
    position: { width: 1000 }
  };

  static PARTS = {
    header: { template: templatePath("actor/character-header.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: templatePath("actor/character-main.hbs"), scrollable: [""] },
    gear: { template: templatePath("actor/character-gear.hbs"), scrollable: [""] },
    relations: { template: templatePath("actor/character-relations.hbs"), scrollable: [""] },
    bio: { template: templatePath("actor/character-bio.hbs"), scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main", icon: "fa-solid fa-dice-d20", label: "SPINDLE.Tab.main" },
        { id: "gear", icon: "fa-solid fa-suitcase", label: "SPINDLE.Tab.gear" },
        { id: "relations", icon: "fa-solid fa-people-group", label: "SPINDLE.Tab.relations" },
        { id: "bio", icon: "fa-solid fa-feather", label: "SPINDLE.Tab.bio" }
      ],
      initial: "main"
    }
  };

  static HTML_FIELDS = ["biography", "injuries", "appearance", "notes", "cabin.description", "cabin.storage"];

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.document.system;

    context.attributeRows = prepareAttributeRows(system, context.items.ability ?? []);
    context.abilityTiers = ABILITY_TIERS;
    context.factions = Object.entries(SPINDLE.factions).map(([key, label]) => ({
      key, label, value: system.factions[key]
    }));
    context.clans = Object.entries(SPINDLE.clans).map(([key, label]) => ({
      key, label, value: system.clans[key]
    }));
    context.resources = Object.entries(SPINDLE.resourceTiers).map(([key, label]) => ({
      key, label, value: system.resources[key]
    }));

    const traits = context.items.trait ?? [];
    context.traits = {
      positive: traits.filter(t => t.system.kind === "positive"),
      negative: traits.filter(t => t.system.kind === "negative")
    };
    context.traitSummaries = Object.fromEntries(traits.map(t => [t.id, summarize(t.system.description)]));
    // Правило книги: на каждые две положительные черты — одна отрицательная.
    context.traitsWarning = context.traits.negative.length < Math.floor(context.traits.positive.length / 2);

    const gear = context.items.gear ?? [];
    context.gear = {
      large: gear.filter(g => (g.system.size !== "small") && !g.system.stored),
      small: gear.filter(g => (g.system.size === "small") && !g.system.stored)
    };
    context.stored = this.document.items.filter(i => i.system.stored);
    context.specialization = system.specialization;
    context.religionOptions = { "": "SPINDLE.None", ...SPINDLE.religions };
    context.sizeLabels = Object.fromEntries(Object.entries(SPINDLE.sizes).map(([k, v]) => [k, v.label]));
    context.rangeLabels = Object.fromEntries(Object.entries(SPINDLE.ranges).map(([k, v]) => [k, v.label]));
    context.heroTokensEnabled = game.settings.get("star-spindle", "heroTokens");
    return context;
  }
}
