// Generates synthetic, email-confirmed accounts for password-auth E2E only.
// Does not test email delivery. Keep every generated file ignored.
import { randomUUID, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
const users = ["admin", "invitee"].map((role) => ({
  role,
  id: randomUUID(),
  email: `eduplan-${role}-${randomUUID()}@example.com`,
  password: randomBytes(24).toString("base64url"),
}));
writeFileSync(".test-secrets.json", JSON.stringify({ users }, null, 2), {
  mode: 0o600,
});
let sql = "begin;\n";
for (const u of users) {
  sql += `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('00000000-0000-0000-0000-000000000000','${u.id}','authenticated','authenticated','${u.email}',extensions.crypt('${u.password}',extensions.gen_salt('bf')),now(),'','','','','{"provider":"email","providers":["email"]}','{"display_name":"가상 테스트 ${u.role === "admin" ? "관리자" : "교사"}"}',now(),now());\ninsert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at) values(gen_random_uuid(),'${u.id}','${u.id}','email','{"sub":"${u.id}","email":"${u.email}"}',now(),now());\n`;
}
sql += "commit;";
writeFileSync(".test-secrets-setup.sql", sql, { mode: 0o600 });
const ids = users.map((u) => `'${u.id}'`).join(",");
writeFileSync(
  ".test-secrets-cleanup.sql",
  `begin;\ndelete from auth.sessions where user_id in (${ids});\ndelete from public.curriculum_hours where workspace_id in (select id from public.workspaces where owner_id in (${ids}));\ndelete from public.subjects where workspace_id in (select id from public.workspaces where owner_id in (${ids}));\ndelete from public.subject_groups where workspace_id in (select id from public.workspaces where owner_id in (${ids}));\ndelete from public.workspaces where owner_id in (${ids});\ndelete from auth.users where id in (${ids});\ncommit;`,
  { mode: 0o600 },
);
console.log("Two synthetic fixtures prepared; no credentials printed.");
