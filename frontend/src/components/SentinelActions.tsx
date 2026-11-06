import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api/client";
import { PRIMARY_AVATAR_COLOR, circlePalette } from "../theme";
import { Modal } from "./Modal";
import {
  removeMembership,
  updateMembership,
  type Circle,
  type LeadSlot,
  type Membership,
} from "../api/sentinel";
import { genderContext } from "../gender";

// What I can do about one of my Sentinels (role, placement) —
// shown on their person page (PersonPage), under "watches over you".
export function SentinelActions({
  m,
  circles,
  isPrimary,
  onChange,
  onError,
}: {
  m: Membership;
  circles: Circle[];
  isPrimary: boolean;
  onChange: () => void;
  onError: (msg: string) => void;
}) {
  const { t } = useTranslation();
  // Real circles to move into (not this one, not the reserve — the reserve
  // has its own button below).
  const reserve = circles.find((c) => c.circleType === "RESERVED");
  const otherCircles = circles.filter(
    (c) => c.id !== m.circleId && c.circleType !== "RESERVED",
  );
  // Moving: one button opens a small window listing my other circles; a
  // circle picked there then goes through the usual confirmation.
  const [picking, setPicking] = useState(false);
  // Same colors as on My Circles: gold for the 1st circle, else the
  // blue/teal palette in the order of my other circles.
  const ordinary = circles.filter(
    (c) => c.circleType !== "FIRST" && c.circleType !== "RESERVED",
  );
  const circleColorOf = (c: Circle) =>
    c.circleType === "FIRST"
      ? PRIMARY_AVATAR_COLOR
      : circlePalette(Math.max(0, ordinary.findIndex((o) => o.id === c.id))).color;
  // Every change here is confirmed first, in a small window saying what
  // will happen.
  const [pending, setPending] = useState<{ text: string; confirm: string; danger?: boolean; run: () => Promise<unknown> } | null>(null);
  const ask = (text: string, confirm: string, run: () => Promise<unknown>, danger = false) =>
    setPending({ text, confirm, run, danger });
  const runPending = async () => {
    const p = pending;
    setPending(null);
    if (!p) return;
    try {
      await p.run();
      onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  };
  const name = m.linkAsSentinel.firstName;
  const circleLabel = (id: string) => circles.find((c) => c.id === id)?.label ?? "";

  const toReserve = () =>
    reserve &&
    ask(
      t("circles.confirm.toReserve", { name, context: genderContext(m.linkAsSentinel.gender) }),
      t("circles.placement.toReserve"),
      () => updateMembership(m.id, { circleId: reserve.id }),
    );

  // Ends only this direction (they stop watching over me).
  const remove = () =>
    ask(t("circles.placement.removeExplain", { name, context: genderContext(m.linkAsSentinel.gender) }), t("circles.placement.removeConfirm"), () => removeMembership(m.id), true);

  const move = (circleId: string) => {
    setPicking(false);
    ask(
      t("circles.confirm.move", { name, circle: circleLabel(circleId) }),
      t("circles.placement.moveTo", { circle: circleLabel(circleId) }),
      () => updateMembership(m.id, { circleId }),
    );
  };

  const setLeadOrder = (leadSlot: LeadSlot) =>
    ask(
      t("circles.confirm.leadOrder", { name, slot: t(`circles.leadOrder.${leadSlot === "LEAD_1" ? "first" : leadSlot === "LEAD_2" ? "second" : "third"}`) }),
      t("common.confirm"),
      () => updateMembership(m.id, { leadSlot }),
    );

  const toggleLead = () =>
    ask(
      t(m.leadSlot ? "circles.confirm.removeLead" : "circles.confirm.makeLead", { name }),
      m.leadSlot ? t("circles.removeLead") : t("circles.makeLead"),
      () => updateMembership(m.id, { requestedAsLead: !m.leadSlot }),
    );

  const proposedCircleLabel = m.proposedCircleId
    ? circles.find((c) => c.id === m.proposedCircleId)?.label
    : null;

  return (
    <div className="member-panel">
      {/* Only what's unusual: a link not accepted yet, or a pending move.
          (Accepted, type and Lead are already said by the title and pill.) */}
      {(m.status !== "ACCEPTED" || proposedCircleLabel) && (
        <div className="member-panel-badges">
          {m.status !== "ACCEPTED" && (
            <span className={`badge status-${m.status.toLowerCase()}`}>
              {t(`sentinel.status.${m.status}`)}
            </span>
          )}
          {proposedCircleLabel && (
            <span className="badge">
              {t("circles.awaitingFirstCircleConsent")}
            </span>
          )}
        </div>
      )}
      {/* Two sections: role on top, then where this Sentinel sits among my
          circles (move / remove). Whether they may chat with the 1st circle
          during an alert is a per-circle rule (circle page), not set here. */}
      {/* Call order (outer circles) is hidden for now: the backend keeps it,
          contacting in random order when unset. */}
      {m.status === "ACCEPTED" && isPrimary && (
        <section className="member-panel-section">
              <button className="ghost" onClick={toggleLead}>
                {m.leadSlot ? t("circles.removeLead") : t("circles.makeLead")}
              </button>
              {/* Lead order: Lead 1 is the responsible Lead when an alert starts;
                the next ones take over if they can't. */}
              {m.leadSlot && (
                <label className="row" style={{ gap: "0.3rem" }}>
                  <span
                    style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}
                  >
                    {t("circles.leadOrder.label")}
                  </span>
                  <select
                    value={m.leadSlot}
                    onChange={(e) => setLeadOrder(e.target.value as LeadSlot)}
                  >
                    <option value="LEAD_1">
                      {t("circles.leadOrder.first")}
                    </option>
                    <option value="LEAD_2">
                      {t("circles.leadOrder.second")}
                    </option>
                    <option value="LEAD_3">
                      {t("circles.leadOrder.third")}
                    </option>
                  </select>
                </label>
              )}
        </section>
      )}

      <section className="member-panel-section member-placement">
        {otherCircles.length > 0 && (
          <button className="ghost" onClick={() => setPicking(true)}>
            {t("circles.placement.moveTitle")}
          </button>
        )}
        {reserve && m.circleId !== reserve.id && (
          <button className="ghost" onClick={toReserve}>
            {t("circles.placement.toReserve")}
          </button>
        )}
        <button className="ghost danger" onClick={remove}>
          {t("circles.placement.removeLink")}
        </button>
      </section>

      {picking && (
        <Modal title={t("circles.placement.pickTitle", { name })} onClose={() => setPicking(false)}>
          <ul className="circle-pick-list">
            {otherCircles.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => move(c.id)}>
                  <span className="circle-pick-dot" style={{ background: circleColorOf(c) }} />
                  {c.label}
                  <span aria-hidden="true" className="circle-pick-arrow">›</span>
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {pending && (
        <Modal title={t("circles.confirm.title")} onClose={() => setPending(null)}>
          <p>{pending.text}</p>
          <div className="row">
            <button className={pending.danger ? "danger" : undefined} onClick={runPending}>
              {pending.confirm}
            </button>
            <button className="ghost" onClick={() => setPending(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
