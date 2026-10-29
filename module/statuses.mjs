/**
 * Состояния из книги правил для токенов и активных эффектов.
 * Состояния с числовыми штрафами меняют бонусы проверок напрямую.
 */
export function registerStatusEffects() {
  const ADD = CONST.ACTIVE_EFFECT_MODES.ADD;
  const MULTIPLY = CONST.ACTIVE_EFFECT_MODES.MULTIPLY;
  const add = (key, value) => ({ key, mode: ADD, value: String(value) });

  const statuses = [
    { id: "shock", img: "icons/svg/daze.svg" },
    { id: "stunned", img: "icons/svg/lightning.svg" },
    { id: "helpless", img: "icons/svg/unconscious.svg" },
    {
      id: "fatigued", img: "icons/svg/sleep.svg",
      // −2 к силе и наблюдательности, −1 к остальным проверкам.
      changes: [add("system.bonuses.checks", -1), add("system.skills.strength.bonus", -1), add("system.skills.observation.bonus", -1)]
    },
    {
      id: "exhausted", img: "icons/svg/degen.svg",
      // −3 к силе и наблюдательности, −2 к остальным, скорость вдвое ниже.
      changes: [add("system.bonuses.checks", -2), add("system.skills.strength.bonus", -1), add("system.skills.observation.bonus", -1),
        { key: "system.speed", mode: MULTIPLY, value: "0.5" }]
    },
    { id: "immobilized", img: "icons/svg/net.svg" },
    { id: "sick", img: "icons/svg/biohazard.svg" },
    { id: "entranced", img: "icons/svg/eye.svg", changes: [add("system.bonuses.checks", -4)] },
    { id: "poisoned", img: "icons/svg/poison.svg" },
    { id: "prone", img: "icons/svg/falling.svg" },
    { id: "bleeding", img: "icons/svg/blood.svg" },
    { id: "incapacitated", img: "icons/svg/skull.svg" },
    { id: "broken", img: "icons/svg/terror.svg" },
    { id: "cursed", img: "icons/svg/aura.svg" },
    { id: "blind", img: "icons/svg/blind.svg" }
  ].map(s => ({ ...s, name: `SPINDLE.Status.${s.id}` }));

  // Оставляем стандартное состояние «мёртв», остальное заменяем состояниями системы.
  const dead = CONFIG.statusEffects.find(s => s.id === "dead");
  CONFIG.statusEffects = dead ? [dead, ...statuses] : statuses;
}
