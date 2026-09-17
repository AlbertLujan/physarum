/**
 * Shuttle streaming: in a living plasmodium cytoplasm flows back and forth every one to two minutes, and the
 * contraction travels along the veins as a peristaltic wave (Alim et al. 2013). One model step is 40 s, far too
 * coarse to resolve that rhythm, so the pulse is shown slowed down on screen and does not affect the model.
 */
export const PULSE = Object.freeze({
  periodSeconds: 2.2,   // on-screen seconds per contraction cycle
  wavelength: 2600,     // route cost between two crests (a vein cell costs roughly 8 to 90)
});

/**
 * Brightness of the pulse at a point of the network: 1 at a crest, 0 in a trough.
 * The wave starts at the sources (food and inoculum) and travels outward along the supply routes.
 * @param {number} distance route cost from the nearest source, or -1 for cells outside the routed network
 * @param {number} timeSeconds on-screen time
 * @returns {number} 0..1
 */
export function pulseLevel(distance, timeSeconds) {
  if (distance < 0) return 1;
  const phase = (timeSeconds / PULSE.periodSeconds - distance / PULSE.wavelength) * Math.PI * 2;
  return 0.5 + 0.5 * Math.cos(phase);
}
