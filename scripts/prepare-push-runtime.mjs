// Produces environment-specific credentials. Production setup requires the explicit --production flag.
import { createECDH, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
const [projectId, output, mode] = process.argv.slice(2);
if (
  !output ||
  !(
    projectId === "qvohqvwhjkgvgzbzyzrr" ||
    (projectId === "sssyjkwcsyeyfkqmdgnb" && mode === "--production")
  )
)
  throw Error(
    "Provide an approved project and output file. Production requires --production.",
  );
const keys = createECDH("prime256v1");
keys.generateKeys();
const sql = `do $setup$
declare private_id uuid;dispatch_id uuid;
begin
 if exists(select 1 from private.lesson_push_runtime) then raise exception 'Runtime already configured; never overwrite live keys';end if;
 private_id:=vault.create_secret('${keys.getPrivateKey().toString("base64url")}','eduplan_lesson_vapid_private','Lesson push VAPID private key');
 dispatch_id:=vault.create_secret('${randomBytes(32).toString("base64url")}','eduplan_lesson_dispatch','Internal cron authentication');
 insert into private.lesson_push_runtime(singleton,public_key,private_key_secret,dispatch_secret,subject,enabled,function_url) values(true,'${keys.getPublicKey().toString("base64url")}',private_id,dispatch_id,'https://github.com/seonu9912-afk/eduplan',true,'https://${projectId}.supabase.co/functions/v1/lesson-push');
 perform cron.schedule('eduplan-lesson-push','* * * * *','select private.dispatch_lesson_push()');
end $setup$;
select true as configured;`;
writeFileSync(output, sql, { mode: 0o600, flag: "wx" });
console.log("Private setup file prepared. Keys were not printed.");
