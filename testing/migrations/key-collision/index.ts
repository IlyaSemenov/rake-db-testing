// The key deliberately collides with a migration of the valid set.
export const keyCollisionMigrations = {
  "0001_valid_user": () => import("./0001_key_collision_user"),
}
