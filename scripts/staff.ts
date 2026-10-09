/**
 * Alta de miembros del equipo y cambio de contraseña, con la service role.
 *
 *   npm run staff:create -- --email ana@empresa.com --name "Ana Pérez" --role admin
 *   npm run staff:password -- --email ana@empresa.com
 *
 * La contraseña se pide dos veces por teclado (sin mostrarla), nunca como argumento,
 * para que no quede en el historial de la terminal. Lee las claves de .env.local.
 */
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "../src/lib/database.types";
import { PASSWORD_ERROR_MESSAGES, validateNewPassword } from "../src/lib/domain/auth";
import { parseServerEnv } from "../src/lib/env";

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "staff" },
    remote: { type: "boolean", default: false },
  },
});

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

// Entrada de líneas: con teclado oculta lo que se escribe; sin teclado (tuberías) lee de stdin.
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
const pendingLines: string[] = [];
const waiting: ((line: string) => void)[] = [];
rl.on("line", (line) => {
  const resolve = waiting.shift();
  if (resolve) resolve(line);
  else pendingLines.push(line);
});
let muted = false;
const writeOutput = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl);
(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
  if (!muted || s.includes("\n")) writeOutput(muted ? "\n" : s);
};

async function askHidden(question: string): Promise<string> {
  process.stdout.write(question);
  muted = true;
  const line = pendingLines.shift() ?? (await new Promise<string>((resolve) => waiting.push(resolve)));
  muted = false;
  if (!process.stdin.isTTY) process.stdout.write("\n");
  return line;
}

async function askNewPassword(): Promise<string> {
  const password = await askHidden("Contraseña: ");
  const confirmation = await askHidden("Repite la contraseña: ");
  const result = validateNewPassword(password, confirmation);
  if (!result.ok) fail(result.errors.map((error) => PASSWORD_ERROR_MESSAGES[error]).join(" "));
  return password;
}

async function main() {
  if (command !== "create" && command !== "password") {
    fail("Uso: staff.ts create --email … --name … [--role admin|staff] | staff.ts password --email …");
  }

  const env = parseServerEnv(process.env);
  const host = new URL(env.supabaseUrl).hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (!isLocal && !values.remote) {
    fail(`NEXT_PUBLIC_SUPABASE_URL apunta a ${host}. Para actuar sobre un proyecto remoto añade --remote.`);
  }
  console.log(`Supabase: ${env.supabaseUrl}`);

  const email = z.email().safeParse(values.email?.trim().toLowerCase());
  if (!email.success) fail("Falta --email o no es válido.");

  const admin = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (command === "create") {
    const name = values.name?.trim();
    if (!name) fail("Falta --name.");
    const role = z.enum(["admin", "staff"]).safeParse(values.role);
    if (!role.success) fail("--role debe ser admin o staff.");

    const password = await askNewPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email: email.data,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error || !data.user) fail(`No se pudo crear el usuario: ${error?.message ?? "sin respuesta"}`);

    const { error: staffError } = await admin.from("staff").insert({ user_id: data.user.id, name, role: role.data });
    if (staffError) {
      await admin.auth.admin.deleteUser(data.user.id);
      fail(`No se pudo dar de alta en staff (usuario revertido): ${staffError.message}`);
    }
    console.log(`✓ ${name} <${email.data}> dado de alta como ${role.data}.`);
    return;
  }

  // password: busca el usuario por email (el equipo es pequeño: basta con paginar).
  let userId: string | undefined;
  for (let page = 1; !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`No se pudo buscar el usuario: ${error.message}`);
    userId = data.users.find((user) => user.email?.toLowerCase() === email.data)?.id;
    if (data.users.length < 200) break;
  }
  if (!userId) fail(`No existe ningún usuario con el email ${email.data}.`);

  const password = await askNewPassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) fail(`No se pudo cambiar la contraseña: ${error.message}`);
  console.log(`✓ Contraseña de ${email.data} actualizada.`);
}

main()
  .catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
  .finally(() => rl.close());
