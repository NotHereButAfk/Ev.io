// Copy authoritative resources into the presentation objects consumed by the
// HUD. Movement prediction owns position/velocity, but the server still owns
// stamina and throwable inventory.
export function applyAuthoritativeResources(player, client, grenades) {
  player.shield = client.self.shield ?? player.shield;
  if (client.self.maxShield != null) player.maxShield = client.self.maxShield;
  player.stamina = client.sim?.stamina ?? player.stamina;
  if (grenades && client.self.abilities) {
    grenades.frags = client.self.abilities.frag ?? grenades.frags;
    grenades.smokes = client.self.abilities.smoke ?? grenades.smokes;
  }
}
