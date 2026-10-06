# 2. DB schema
git add drizzle/migrations/ src/db/
git commit --no-verify -m "refactor(db): restructure schema and add drizzle migrations"

# 3. Auth
git add src/auth/ src/lib/ src/config/ src/app.ts src/index.ts src/services/auth/ src/controllers/v1/auth.controller.ts src/routes/v1/auth.route.ts src/shared/middleware/ src/types/ src/shared/validations/auth.schema.ts src/shared/utils/ResendClient.ts src/shared/utils/emailTemplates.ts
git commit --no-verify -m "refactor(auth): migrate to better-auth and reorganize auth modules"

# 4. Domain (Jobs, Stations, etc.)
git add src/services/job/ src/controllers/v1/jobs.controller.ts src/routes/v1/jobs.route.ts src/services/location/ src/controllers/v1/locations.controller.ts src/routes/v1/locations.route.ts src/services/station/ src/controllers/v1/stations.controller.ts src/routes/v1/stations.route.ts src/services/employee/ src/controllers/v1/employees.controller.ts src/routes/v1/employees.route.ts src/shared/validations/employees.schema.ts scripts/ src/services/roles/
git commit --no-verify -m "feat(domain): transition from roles to jobs/stations and enhance employees"

# 5. Features (Categories, etc.)
git add src/controllers/v1/categories.controller.ts src/routes/v1/categories.route.ts src/controllers/v1/subcategories.controller.ts src/services/categories/ src/controllers/v1/procedures.controller.ts src/routes/v1/procedures.route.ts src/services/procedures/ src/services/procedureExtract/ src/services/documentExtract/ src/controllers/v1/uploads.controller.ts src/routes/v1/uploads.route.ts src/services/uploads/ src/shared/validations/categories.schema.ts src/shared/validations/procedures.schema.ts src/shared/validations/subcategories.schema.ts src/shared/validations/uploads.schema.ts src/routes/v1/library.route.ts src/routes/v1/index.ts
git commit --no-verify -m "feat: update categories, procedures, and uploads features"

# 6. Miscellaneous
git add .
git commit --no-verify -m "chore: miscellaneous updates and cleanups"

# Push
git push origin HEAD
