import { SPINDLE, SYSTEM_ID } from "../config.mjs";
import { Chernobog } from "../chernobog.mjs";

const { renderTemplate } = foundry.applications.handlebars;
const { DialogV2 } = foundry.applications.api;

const T = path => `systems/${SYSTEM_ID}/templates/${path}`;
const sign = n => (n > 0 ? `+${n}` : `${n}`);

/**
 * Основная механика: пул к20.
 * Количество кубов = навык + характеристика + снаряжение + сложность + прочие факторы.
 * 20 — критический успех (+2), 17–19 — успех (+1), 2–16 — неудача, 1 — критическая неудача (−2).
 * Пул 0 — бросается 1к20, успехом считается только 20.
 * Пул меньше нуля — бросается 2к20, один успех только если на обоих выпало 20.
 */
export class DicePool {

  /* -------------------------------------------- */
  /*  Подсчёт успехов                             */
  /* -------------------------------------------- */

  /** Значение одного куба при обычном подсчёте. */
  static dieValue(result) {
    if (result === 20) return 2;
    if (result >= 17) return 1;
    if (result === 1) return -2;
    return 0;
  }

  /**
   * Сумма успехов.
   * @param {number[]} results
   * @param {"normal"|"zero"|"desperate"} mode
   * @param {number[]} [bonusResults]  Кубы, добавленные благословением, считаются обычным образом.
   */
  static score(results, mode = "normal", bonusResults = []) {
    let total;
    if (mode === "zero") total = results.some(r => r === 20) ? 1 : 0;
    else if (mode === "desperate") total = (results.length >= 2) && results.every(r => r === 20) ? 1 : 0;
    else total = results.reduce((acc, r) => acc + this.dieValue(r), 0);
    return total + bonusResults.reduce((acc, r) => acc + this.dieValue(r), 0);
  }

  /** Режим броска по размеру пула. */
  static modeFor(pool) {
    if (pool > 0) return { mode: "normal", dice: pool };
    if (pool === 0) return { mode: "zero", dice: 1 };
    return { mode: "desperate", dice: 2 };
  }

  static outcome(successes) {
    return SPINDLE.outcomes.find(o => successes >= o.min).key;
  }

  /* -------------------------------------------- */
  /*  Проверка навыка или характеристики          */
  /* -------------------------------------------- */

  /**
   * Открыть диалог проверки и выполнить бросок.
   * @param {object} options
   * @param {Actor} options.actor           Кто проходит проверку.
   * @param {string} [options.attribute]    Ключ характеристики.
   * @param {string} [options.skill]        Ключ навыка.
   * @param {Item} [options.item]           Оружие (личное или корабельное).
   * @param {Actor} [options.ship]          Корабль, на котором действует член экипажа.
   * @param {string} [options.title]
   * @param {boolean} [options.skipDialog]
   */
  static async check(options = {}) {
    const { actor, item, ship } = options;
    if (!actor) return null;
    const sys = actor.system;
    const skill = options.skill ?? "";
    const attribute = options.attribute ?? (skill ? SPINDLE.skills[skill].attribute : "body");

    // Профессиональный навык нельзя применить без обучения.
    const cfg = SPINDLE.skills[skill];
    if (cfg?.professional && !(sys.skills?.[skill]?.value > 0) && game.settings.get(SYSTEM_ID, "professionalGate")) {
      ui.notifications.warn(game.i18n.format("SPINDLE.Roll.Untrained", { skill: game.i18n.localize(cfg.label) }));
      return null;
    }

    const modifiers = this.#collectModifiers(actor, skill, item, ship);
    const weaponKind = item?.type === "shipWeapon" ? "ship" : (item?.type === "weapon" ? (item.system.isMelee ? "melee" : "ranged") : null);
    const defaults = {
      attribute, skill, difficulty: 0, help: 0, modifier: 0, hero: false,
      targetReputation: null,
      attackMode: weaponKind ? Object.keys(SPINDLE.attackModes[weaponKind])[0] : null,
      range: item?.system.range ?? null,
      engaged: false,
      locked: true,
      enabled: modifiers.map(m => !m.conditional)
    };

    let config = defaults;
    if (!options.skipDialog) {
      config = await this.#dialog(actor, defaults, modifiers, { ...options, weaponKind });
      if (!config) return null;
    }
    // Атрибут и навык могли смениться в диалоге — бонусы предметов пересчитываются.
    const finalMods = ((config.skill === skill) && (config.attribute === attribute))
      ? modifiers.filter((m, i) => config.enabled[i])
      : this.#collectModifiers(actor, config.skill, item, ship).filter(m => !m.conditional);

    const parts = [];
    const base = sys.attributes?.[config.attribute]?.value ?? 0;
    parts.push({ label: SPINDLE.attributes[config.attribute], value: base });
    if (config.skill) parts.push({ label: SPINDLE.skills[config.skill].label, value: sys.skills?.[config.skill]?.value ?? 0 });
    parts.push(...finalMods);
    if (config.difficulty) parts.push({ label: "SPINDLE.Roll.Difficulty", value: config.difficulty });
    if (config.help) parts.push({ label: "SPINDLE.Roll.Help", value: Math.min(config.help, 3) });
    if (config.modifier) parts.push({ label: "SPINDLE.Roll.Modifier", value: config.modifier });
    if (config.hero && sys.heroTokens > 0) {
      parts.push({ label: "SPINDLE.Roll.HeroToken", value: 3 });
      await actor.update({ "system.heroTokens": sys.heroTokens - 1 });
    }
    if ((config.targetReputation !== null) && (config.skill === "influence") && ("reputation" in sys)) {
      parts.push({ label: "SPINDLE.Roll.ReputationDiff", value: sys.reputation - config.targetReputation });
    }
    if (weaponKind) parts.push(...this.#attackModifiers(item, weaponKind, config));

    const title = options.title ?? this.#makeTitle(config);
    return this.roll({ actor, title, parts, item, ship, skill: config.skill, attackMode: config.attackMode });
  }

  static #makeTitle({ attribute, skill }) {
    if (skill) return game.i18n.localize(SPINDLE.skills[skill].label);
    return game.i18n.localize(SPINDLE.attributes[attribute]);
  }

  /**
   * Модификаторы, которые предлагаются в диалоге отмеченными:
   * оружие, снаряжение, способности, черты, вес брони, перегруз, корабль.
   */
  static #collectModifiers(actor, skill, item, ship) {
    const mods = [];
    if (item) {
      const value = item.system.modifier + (item.system.quality ?? 0);
      if (value) mods.push({ label: item.name, value });
    }
    if (actor.system.getSkillBonuses) {
      mods.push(...actor.system.getSkillBonuses(skill).map(b => ({ label: b.name, value: b.value, conditional: b.conditional })));
    }
    if (actor.system.getSituationalModifiers) mods.push(...actor.system.getSituationalModifiers(skill));
    if (ship?.system.getCrewModifiers) mods.push(...ship.system.getCrewModifiers(skill));
    return mods;
  }

  /** Модификаторы атаки: вид атаки, дистанция и выход за эффективную дальность. */
  static #attackModifiers(item, kind, config) {
    const mods = [];
    const mode = SPINDLE.attackModes[kind][config.attackMode];
    if (mode?.mod) mods.push({ label: mode.label, value: mode.mod });
    if (kind === "melee") return mods;

    const ranges = kind === "ship" ? SPINDLE.shipRanges : SPINDLE.ranges;
    const range = ranges[config.range];
    const effective = ranges[item.system.range];
    if (range) {
      if (range.mod) mods.push({ label: range.label, value: range.mod });
      const beyond = effective ? Math.max(range.step - effective.step, 0) : 0;
      if (beyond) mods.push({ label: "SPINDLE.Roll.BeyondRange", value: -3 * beyond });
    }
    if ((kind === "ranged") && config.engaged) mods.push({ label: "SPINDLE.Roll.Engaged", value: -3 });
    if ((kind === "ship") && !config.locked) mods.push({ label: "SPINDLE.Roll.NoLock", value: -2 });
    return mods;
  }

  static async #dialog(actor, config, modifiers, options) {
    const sys = actor.system;
    const kind = options.weaponKind;
    const context = {
      item: options.item,
      attributes: Object.entries(SPINDLE.attributes).map(([key, label]) => ({
        key, label, value: sys.attributes?.[key]?.value ?? 0, selected: key === config.attribute
      })),
      skills: Object.entries(SPINDLE.skills).map(([key, cfg]) => ({
        key, label: cfg.label, value: sys.skills?.[key]?.value ?? 0, selected: key === config.skill
      })),
      modifiers: modifiers.map(m => ({ ...m, signed: sign(m.value) })),
      difficulties: SPINDLE.difficulties.map(d => ({ ...d, signed: sign(d.value), selected: d.value === 0 })),
      heroTokens: game.settings.get(SYSTEM_ID, "heroTokens") ? (sys.heroTokens ?? 0) : 0,
      influence: (config.skill === "influence") && ("reputation" in sys),
      attackModes: kind ? Object.entries(SPINDLE.attackModes[kind])
        .filter(([key]) => (key !== "auto") || options.item.system.automatic)
        .map(([key, m]) => ({ key, label: m.label, signed: sign(m.mod), selected: key === config.attackMode })) : null,
      ranges: (kind && kind !== "melee")
        ? Object.entries(kind === "ship" ? SPINDLE.shipRanges : SPINDLE.ranges).map(([key, r]) => ({
          key, label: r.label, signed: sign(r.mod), selected: key === config.range
        })) : null,
      ranged: kind === "ranged",
      ship: kind === "ship"
    };
    const content = await renderTemplate(T("dialog/roll-dialog.hbs"), context);

    return DialogV2.wait({
      window: { title: options.title ?? game.i18n.localize("SPINDLE.Roll.Title"), icon: "fa-solid fa-dice-d20" },
      position: { width: 420 },
      classes: ["star-spindle", "roll-dialog"],
      content,
      rejectClose: false,
      buttons: [{
        action: "roll",
        label: "SPINDLE.Roll.Roll",
        icon: "fa-solid fa-dice-d20",
        default: true,
        callback: (event, button) => {
          const f = button.form.elements;
          const enabled = Array.from(button.form.querySelectorAll("input[name='mod']")).map(el => el.checked);
          const rep = f.targetReputation?.value;
          return {
            attribute: f.attribute.value,
            skill: f.skill.value,
            difficulty: Number(f.difficulty.value) || 0,
            help: Number(f.help.value) || 0,
            modifier: Number(f.modifier.value) || 0,
            hero: f.hero?.checked ?? false,
            targetReputation: (rep === undefined) || (rep === "") ? null : Number(rep),
            attackMode: f.attackMode?.value ?? null,
            range: f.range?.value ?? null,
            engaged: f.engaged?.checked ?? false,
            locked: f.locked?.checked ?? true,
            enabled
          };
        }
      }, {
        action: "cancel",
        label: "Cancel",
        icon: "fa-solid fa-xmark"
      }]
    });
  }

  /* -------------------------------------------- */
  /*  Бросок                                      */
  /* -------------------------------------------- */

  /**
   * Бросить пул и отправить карточку в чат.
   * @param {object} options
   * @param {Actor} options.actor
   * @param {string} options.title
   * @param {{label: string, value: number}[]} options.parts  Составляющие пула.
   * @param {Item} [options.item]
   * @param {Actor} [options.ship]
   * @param {string} [options.skill]
   * @param {object} [options.resist]   Данные проверки сопротивления.
   */
  static async roll({ actor, title, parts, item, ship, skill, attackMode, resist }) {
    const pool = parts.reduce((acc, p) => acc + p.value, 0);
    const { mode, dice } = this.modeFor(pool);
    const roll = await new Roll(`${dice}d20`).evaluate();
    const results = roll.dice[0].results.map(r => r.result);

    // Автоматический огонь: после проверки к20 бросаются по одному, пока не выпадет 1–4.
    // Молитва перебрасывает только кубы основной проверки.
    const autoResults = [];
    const extraRolls = [];
    if (["auto", "burst"].includes(attackMode)) {
      let result;
      do {
        const one = await new Roll("1d20").evaluate();
        extraRolls.push(one);
        result = one.total;
        autoResults.push(result);
      } while ((result > 4) && (autoResults.length < 50));
    }

    const state = {
      actorUuid: actor.uuid,
      shipUuid: ship?.uuid ?? null,
      itemUuid: item?.uuid ?? null,
      title,
      skill: skill ?? null,
      attackMode: attackMode ?? null,
      parts: parts.map(p => ({ label: p.label, value: p.value })),
      pool,
      mode,
      results,
      bonusResults: [],
      autoResults,
      prayers: 0,
      resist: resist ?? null
    };

    // Мастер получает жетон за каждую практику ведовства, применённую игроком.
    if ((skill === "witchcraft") && (actor.type === "character") && game.settings.get(SYSTEM_ID, "autoTokens")) {
      Chernobog.add(1, game.i18n.format("SPINDLE.Chernobog.Witchcraft", { name: actor.name }));
    }
    return this.toMessage(state, roll, actor, extraRolls);
  }

  /** Бросок фиксированного числа кубов (ситуативный урон, упрощённые правила Мастера). */
  static rollDice({ actor, title, dice }) {
    return this.roll({ actor, title, parts: [{ label: "SPINDLE.Roll.Dice", value: dice }] });
  }

  /* -------------------------------------------- */
  /*  Молитва                                     */
  /* -------------------------------------------- */

  /**
   * Вознести молитву: перебросить выбранные кубы.
   * Персонаж получает 1 урон воле сразу и ещё по 1 за каждую выпавшую при перебросе единицу,
   * а Мастер получает жетон Чернобога. Для персонажей Мастера переброс стоит 1 жетон Чернобога.
   * @param {ChatMessage} message
   * @param {number[]} indices  Номера перебрасываемых кубов.
   */
  static async pray(message, indices) {
    const state = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "pool"));
    if (!state) return;
    const actor = await fromUuid(state.actorUuid);
    if (!actor) return;
    const isCharacter = actor.type === "character";
    if (!(actor.isOwner || game.user.isGM)) {
      return ui.notifications.warn("SPINDLE.Roll.NotOwner", { localize: true });
    }
    if (isCharacter && !actor.system.canPray) {
      return ui.notifications.warn("SPINDLE.Prayer.Atheist", { localize: true });
    }
    if (!isCharacter) {
      if (!game.user.isGM) return;
      if (!(await Chernobog.spend(1, game.i18n.format("SPINDLE.Chernobog.Reroll", { name: actor.name })))) return;
    }

    // Если ничего не выбрано — перебрасываются все кубы без успеха.
    if (!indices.length) indices = state.results.map((r, i) => (r < 17 ? i : null)).filter(i => i !== null);
    if (!indices.length) return ui.notifications.info("SPINDLE.Prayer.NothingToReroll", { localize: true });

    const blessed = isCharacter && (actor.system.blessing > 0);
    const count = indices.length + (blessed ? 1 : 0);
    const roll = await new Roll(`${count}d20`).evaluate();
    const fresh = roll.dice[0].results.map(r => r.result);
    indices.forEach((idx, n) => { state.results[idx] = fresh[n]; });
    if (blessed) state.bonusResults.push(fresh.at(-1));
    state.prayers += 1;
    state.rerolled = indices;

    await message.update({ [`flags.${SYSTEM_ID}.pool.superseded`]: true });

    if (isCharacter) {
      const ones = fresh.filter(r => r === 1).length;
      const willLoss = 1 + ones;
      state.willLoss = willLoss;
      const update = { "system.will.value": actor.system.will.value - willLoss };
      if (blessed) update["system.blessing"] = actor.system.blessing - 1;
      await actor.update(update);
      await Chernobog.add(1, game.i18n.format("SPINDLE.Chernobog.Prayer", { name: actor.name }));
    }
    return this.toMessage(state, roll, actor);
  }

  /* -------------------------------------------- */
  /*  Карточка в чате                             */
  /* -------------------------------------------- */

  static async toMessage(state, roll, actor, extraRolls = []) {
    const item = state.itemUuid ? await fromUuid(state.itemUuid) : null;
    const successes = this.score(state.results, state.mode, [...state.bonusResults, ...(state.autoResults ?? [])]);
    const outcome = this.outcome(successes);
    const isCharacter = actor.type === "character";

    const describe = r => ({
      value: r,
      cls: r === 20 ? "crit" : (r >= 17 ? "success" : (r === 1 ? "fumble" : "fail"))
    });
    const context = {
      state,
      successes,
      signedSuccesses: sign(successes),
      outcome,
      outcomeLabel: `SPINDLE.Outcome.${outcome}`,
      dice: state.results.map((r, index) => ({ ...describe(r), index, rerolled: state.rerolled?.includes(index) })),
      bonusDice: state.bonusResults.map(describe),
      autoDice: (state.autoResults ?? []).map(describe),
      parts: state.parts.map(p => ({ ...p, signed: sign(p.value) })),
      modeHint: state.mode === "normal" ? null : `SPINDLE.Roll.Mode.${state.mode}`,
      canPray: isCharacter ? actor.system.canPray : true,
      prayLabel: isCharacter ? "SPINDLE.Prayer.Pray" : "SPINDLE.Prayer.GmReroll",
      item
    };

    if (state.resist) {
      const remaining = Math.max(state.resist.strength - Math.max(successes, 0), 0);
      context.resist = { ...state.resist, remaining, resisted: remaining === 0 };
    }

    if (item && ["weapon", "shipWeapon"].includes(item.type)) {
      const hit = successes > 0;
      const extra = Math.max(successes - 1, 0);
      const crit = item.system.crit;
      context.attack = {
        hit,
        damage: item.system.damage,
        extra,
        total: item.system.damage + extra,
        crit,
        injuries: hit && crit > 0 ? Math.floor(extra / crit) : 0,
        ship: item.type === "shipWeapon",
        pierce: item.system.armorPiercing ?? 0,
        damageType: item.system.damageType ?? null,
        ignoresArmor: item.system.ignoresArmor ?? (state.attackMode === "choke")
      };
    }

    const content = await renderTemplate(T("chat/roll-card.hbs"), context);
    const data = {
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      rolls: [roll, ...extraRolls],
      sound: CONFIG.sounds.dice,
      flags: { [SYSTEM_ID]: { pool: state } }
    };
    ChatMessage.applyRollMode(data, game.settings.get("core", "rollMode"));
    return ChatMessage.create(data);
  }

  /** Обработчики кнопок карточек. */
  static onRenderChatMessage(message, html) {
    const state = message.getFlag(SYSTEM_ID, "pool");
    const actor = state ? fromUuidSync(state.actorUuid) : null;
    const canAct = game.user.isGM || actor?.isOwner;

    const prayBtn = html.querySelector("[data-action='spindle-pray']");
    if (prayBtn) {
      const isCharacter = actor?.type === "character";
      if (state.superseded || !canAct || (!isCharacter && !game.user.isGM)) prayBtn.remove();
      else {
        html.querySelectorAll(".dice-row .die[data-index]").forEach(die => {
          die.classList.add("selectable");
          die.addEventListener("click", () => die.classList.toggle("selected"));
        });
        prayBtn.addEventListener("click", event => {
          event.preventDefault();
          prayBtn.disabled = true;
          const indices = Array.from(html.querySelectorAll(".dice-row .die.selected")).map(d => Number(d.dataset.index));
          this.pray(message, indices);
        });
      }
    }

    html.querySelectorAll("[data-action='spindle-damage']").forEach(btn => {
      btn.addEventListener("click", event => {
        event.preventDefault();
        const d = btn.dataset;
        this.promptDamage({
          amount: Number(d.damage) || 0,
          pierce: Number(d.pierce) || 0,
          ignoreArmor: d.ignoreArmor === "true",
          damageType: d.damageType || null
        });
      });
    });
    html.querySelectorAll("[data-action='spindle-d66']").forEach(btn => {
      btn.addEventListener("click", event => {
        event.preventDefault();
        this.rollD66(btn.dataset.table, { speaker: message.speaker });
      });
    });
  }

  /* -------------------------------------------- */
  /*  Урон и броня                                */
  /* -------------------------------------------- */

  /** Спросить укрытие и нанести урон выбранным целям. */
  static async promptDamage({ amount, pierce = 0, ignoreArmor = false, damageType = null }) {
    let targets = Array.from(game.user.targets);
    if (!targets.length) targets = canvas.tokens?.controlled ?? [];
    targets = targets.map(t => t.actor).filter(Boolean);
    if (!targets.length) return ui.notifications.warn("SPINDLE.Roll.NoTargets", { localize: true });

    const content = await renderTemplate(T("dialog/damage-dialog.hbs"), {
      amount, pierce, ignoreArmor, targets: targets.map(a => a.name).join(", ")
    });
    const config = await DialogV2.wait({
      window: { title: game.i18n.localize("SPINDLE.Damage.Title"), icon: "fa-solid fa-burst" },
      classes: ["star-spindle", "roll-dialog"],
      content,
      rejectClose: false,
      buttons: [{
        action: "apply",
        label: "SPINDLE.Damage.Apply",
        icon: "fa-solid fa-burst",
        default: true,
        callback: (event, button) => {
          const f = button.form.elements;
          return {
            amount: Number(f.amount.value) || 0,
            cover: Number(f.cover.value) || 0,
            pierce: Number(f.pierce.value) || 0,
            ignoreArmor: f.ignoreArmor.checked
          };
        }
      }, { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }]
    });
    if (!config) return;

    for (const actor of targets) {
      const request = { uuid: actor.uuid, ...config, damageType };
      if (actor.isOwner) await this.resolveDamage(request);
      else game.socket.emit(`system.${SYSTEM_ID}`, { action: "damage", request });
    }
  }

  /**
   * Нанести урон с учётом брони.
   * Цель бросает кубы по классу защиты (броня + укрытие); каждый успех снижает урон на 1.
   * Каждая критическая неудача снижает класс защиты укрытия или брони на 1 (у кораблей — нет).
   * Бронебойное оружие игнорирует часть брони, но по цели без брони наносит на 1 урона меньше.
   */
  static async resolveDamage({ uuid, amount, cover = 0, pierce = 0, ignoreArmor = false, damageType = null }) {
    const actor = await fromUuid(uuid);
    if (!actor) return;
    const isShip = actor.type === "ship";
    // У ТС урон идёт по прочности, а броня работает как наземная: критические неудачи её снижают.
    const isVehicle = actor.type === "vehicle";
    const baseArmor = isShip ? actor.system.attributes.armor.value : actor.system.armor;
    let damage = amount;
    if (pierce && !isShip && (baseArmor <= 0)) damage = Math.max(damage - 1, 0);

    const armorDice = ignoreArmor ? 0 : Math.max(baseArmor - pierce, 0) + Math.max(cover, 0);
    let armorRoll = null;
    let reduced = 0;
    let fumbles = 0;
    if (armorDice > 0 && damage > 0) {
      armorRoll = await new Roll(`${armorDice}d20`).evaluate();
      const results = armorRoll.dice[0].results.map(r => r.result);
      reduced = Math.max(this.score(results), 0);
      fumbles = results.filter(r => r === 1).length;
      armorRoll.spindleResults = results;
    }
    const final = Math.max(damage - reduced, 0);

    const update = {};
    if (isShip) {
      const attrs = actor.system.attributes;
      const type = damageType ?? "structural";
      if (["structural", "both"].includes(type)) update["system.attributes.durability.value"] = attrs.durability.value - final;
      if (["system", "both"].includes(type)) update["system.attributes.energy.value"] = attrs.energy.value - final;
    } else if (isVehicle) {
      update["system.durability.value"] = actor.system.durability.value - final;
    } else {
      update["system.health.value"] = actor.system.health.value - final;
    }
    if (final > 0) await actor.update(update);

    // Повреждение брони критическими неудачами (если не досталось укрытию).
    let armorDamaged = null;
    if (fumbles && !isShip) {
      if (cover > 0) armorDamaged = "cover";
      else if (isVehicle) {
        await actor.update({ "system.armor": Math.max(actor.system.armor - fumbles, 0) });
        armorDamaged = actor.name;
      } else {
        const piece = actor.items.filter(i => i.type === "armor" && i.system.equipped && i.system.defense > 0)
          .sort((a, b) => b.system.defense - a.system.defense)[0];
        if (piece) {
          await piece.update({ "system.defense": Math.max(piece.system.defense - fumbles, 0) });
          armorDamaged = piece.name;
        }
      }
    }

    const content = await renderTemplate(T("chat/damage-card.hbs"), {
      name: actor.name,
      amount,
      damage,
      armorDice,
      dice: armorRoll?.spindleResults?.map(r => ({
        value: r, cls: r === 20 ? "crit" : (r >= 17 ? "success" : (r === 1 ? "fumble" : "fail"))
      })) ?? [],
      reduced,
      final,
      fumbles,
      armorDamaged,
      coverDamaged: armorDamaged === "cover",
      isShip,
      // Персонажи внутри ТС получают ситуативный урон, равный урону по ТС.
      passengersDamage: isVehicle && final > 0 ? final : 0,
      damageType: damageType ? `SPINDLE.ShipDamage.${damageType}` : null,
      condition: (isShip || isVehicle) ? null : actor.system.health.condition,
      vehicleCondition: isVehicle && (actor.system.condition !== "ok")
        ? `SPINDLE.Vehicle.Condition.${actor.system.condition}` : null
    });
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      rolls: armorRoll ? [armorRoll] : []
    });
  }

  /* -------------------------------------------- */
  /*  Сопротивление воздействию                   */
  /* -------------------------------------------- */

  /**
   * Проверка здоровья или воли против силы воздействия (СВЗ / СВВ).
   * Бросается к20 по текущему значению; каждый успех снижает силу воздействия на 1.
   * @param {Actor} actor
   * @param {"health"|"will"} resource
   */
  static async resist(actor, resource) {
    const content = await renderTemplate(T("dialog/resist-dialog.hbs"), { resource });
    const config = await DialogV2.wait({
      window: { title: game.i18n.localize(`SPINDLE.Resist.${resource}`), icon: "fa-solid fa-shield-heart" },
      classes: ["star-spindle", "roll-dialog"],
      content,
      rejectClose: false,
      buttons: [{
        action: "roll",
        label: "SPINDLE.Roll.Roll",
        icon: "fa-solid fa-dice-d20",
        default: true,
        callback: (event, button) => {
          const f = button.form.elements;
          return {
            strength: Number(f.strength.value) || 0,
            resistance: f.resistance.value,
            modifier: Number(f.modifier.value) || 0
          };
        }
      }, { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }]
    });
    if (!config) return null;
    const label = game.i18n.localize(`SPINDLE.Resist.${resource}`);
    if (config.resistance === "immune") {
      return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="star-spindle roll-card"><h3>${label}</h3><p>${game.i18n.localize("SPINDLE.Resist.Immune")}</p></div>`
      });
    }
    const parts = [{ label: resource === "health" ? "SPINDLE.Health" : "SPINDLE.Will", value: actor.system[resource].value }];
    if (config.resistance === "resistant") parts.push({ label: "SPINDLE.Resist.Resistant", value: 3 });
    if (config.modifier) parts.push({ label: "SPINDLE.Roll.Modifier", value: config.modifier });
    return this.roll({ actor, title: label, parts, resist: { strength: config.strength, resource } });
  }

  /* -------------------------------------------- */
  /*  к66                                         */
  /* -------------------------------------------- */

  /**
   * Бросок к66 (первый к6 — десятки, второй — единицы).
   * Если в настройках указана таблица, результат ищется в ней (диапазоны 11–66).
   * Бросок по таблице к66 (или к6 — см. SPINDLE.rollTables).
   * @param {string} table  Ключ из SPINDLE.rollTables
   */
  static async rollD66(table, { speaker } = {}) {
    const single = SPINDLE.rollTables[table] === "d6";
    const roll = await new Roll(single ? "1d6" : "1d6 + 1d6").evaluate();
    const [tens, units] = roll.dice.map(d => d.results[0].result);
    const code = single ? tens : (tens * 10) + units;
    let text = "";
    const uuid = game.settings.get(SYSTEM_ID, `table.${table}`);
    if (uuid) {
      const rollTable = await fromUuid(uuid);
      const results = rollTable?.getResultsForRoll?.(code) ?? [];
      const parts = [];
      for (const r of results) {
        const name = r.name ? `<strong>${r.name}</strong>` : "";
        const desc = r.description || r.text || "";
        parts.push([name, desc].filter(Boolean).join(": "));
      }
      // Ссылки @UUID в результатах таблиц (например, на травмы из компендиума) становятся кликабельными.
      text = await foundry.applications.ux.TextEditor.implementation.enrichHTML(parts.join("<br>"));
    }
    const content = `<div class="star-spindle roll-card d66-card">
      <header class="roll-header"><h3>${game.i18n.localize(`SPINDLE.D66.${table}`)}</h3></header>
      <div class="d66-code">${code}</div>
      ${text ? `<div class="d66-text">${text}</div>` : ""}
    </div>`;
    return ChatMessage.create({ speaker: speaker ?? ChatMessage.getSpeaker(), content, rolls: [roll], sound: CONFIG.sounds.dice });
  }

  /* -------------------------------------------- */
  /*  Инициатива корабля                          */
  /* -------------------------------------------- */

  /**
   * Инициатива капитана (к20 + лидерство) или пилота (к20 + пилотирование + манёвренность;
   * у пилотов первым ходит тот, у кого результат меньше).
   */
  static async shipInitiative(ship, role) {
    const actor = ship.system.crewInRole(role);
    if (!actor) return ui.notifications.warn(game.i18n.format("SPINDLE.Crew.NoRole", {
      role: game.i18n.localize(SPINDLE.crewRoles[role])
    }));
    const parts = role === "captain"
      ? [{ label: "SPINDLE.Skill.leadership", value: actor.system.skills.leadership.value }]
      : [{ label: "SPINDLE.Skill.piloting", value: actor.system.skills.piloting.value },
        { label: "SPINDLE.Ship.Attribute.maneuverability", value: ship.system.attributes.maneuverability.value }];
    const formula = ["1d20", ...parts.map(p => (p.value < 0 ? `- ${-p.value}` : `+ ${p.value}`))].join(" ");
    const roll = await new Roll(formula).evaluate();
    const flavor = game.i18n.format(`SPINDLE.Ship.Initiative.${role}`, { ship: ship.name, name: actor.name });
    return roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor });
  }
}
