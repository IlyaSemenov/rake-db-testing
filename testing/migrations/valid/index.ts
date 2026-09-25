export const validMigrations = {
  "0001_valid_user": () => import("./0001_valid_user"),
  "0002_valid_name_title_case": () => import("./0002_valid_name_title_case"),
  "0003_valid_username_unique_ci": () => import("./0003_valid_username_unique_ci"),
  "0004_valid_user_email": () => import("./0004_valid_user_email"),
}
