import { SYSTEM_ID } from "./config.mjs";

/**
 * Жетоны Чернобога: общий для мира счётчик Мастера.
 * Игроки не могут менять настройки мира, поэтому их изменения идут через сокет к Мастеру.
 */
export class Chernobog {
  static SETTING = "chernobogTokens";

  static get value() {
    return game.settings.get(SYSTEM_ID, this.SETTING);
  }

  /**
   * Изменить количество жетонов.
   * @param {number} delta
   * @param {string} [reason] Причина — выводится в чат Мастеру.
   */
  static async add(delta, reason) {
    if (!delta) return;
    if (!game.user.isGM) {
      return game.socket.emit(`system.${SYSTEM_ID}`, { action: "chernobog", delta, reason, user: game.user.id });
    }
    const value = Math.max(this.value + delta, 0);
    await game.settings.set(SYSTEM_ID, this.SETTING, value);
    if (reason) {
      ChatMessage.create({
        content: `<div class="star-spindle chernobog-card"><i class="fa-solid fa-skull"></i> ${reason}
          <strong>${delta > 0 ? "+" : ""}${delta}</strong> → ${value}</div>`,
        whisper: ChatMessage.getWhisperRecipients("GM")
      });
    }
  }

  /** Потратить жетоны; возвращает false, если жетонов не хватает. */
  static async spend(count, reason) {
    if (this.value < count) {
      ui.notifications.warn(game.i18n.localize("SPINDLE.Chernobog.NotEnough"));
      return false;
    }
    await this.add(-count, reason);
    return true;
  }

  /* -------------------------------------------- */

  /** Счётчик под списком игроков. */
  static renderCounter() {
    if (!game.ready) return;
    if (!game.user.isGM && !game.settings.get(SYSTEM_ID, "chernobogVisible")) {
      document.getElementById("spindle-chernobog")?.remove();
      return;
    }
    let el = document.getElementById("spindle-chernobog");
    if (!el) {
      // Счётчик ставится над списком игроков; если его ещё нет, дождёмся хука renderPlayers.
      const anchor = document.getElementById("players");
      if (!anchor) return;
      el = document.createElement("div");
      el.id = "spindle-chernobog";
      el.classList.add("star-spindle");
      anchor.before(el);
      el.addEventListener("click", event => {
        const btn = event.target.closest("[data-delta]");
        if (btn && game.user.isGM) this.add(Number(btn.dataset.delta));
      });
    }
    const label = game.i18n.localize("SPINDLE.Chernobog.Tokens");
    const controls = game.user.isGM
      ? `<a data-delta="-1" data-tooltip="−1"><i class="fa-solid fa-minus"></i></a>
         <a data-delta="1" data-tooltip="+1"><i class="fa-solid fa-plus"></i></a>` : "";
    el.innerHTML = `<i class="fa-solid fa-skull"></i><span class="label">${label}</span>
      <strong>${this.value}</strong>${controls}`;
  }
}
