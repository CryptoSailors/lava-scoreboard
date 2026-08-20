import { execFile } from "child_process";

export type LavadExecOptions = {
  lavadBin: string;
  chainId: string;
  node: string;
};

function execFileAsync(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // Без timeout зависла RPC-сесія блокує цикл збору НАЗАВЖДИ: процес живий,
    // CPU 0%, pm2 зелений, дані не оновлюються. Саме цей клас мовчазної відмови
    // одного разу коштував нам 5 місяців даних.
    execFile(file, args, { maxBuffer: 20 * 1024 * 1024, timeout: 120_000 }, (err, stdout, stderr) => {
      if (err) {
        const e = new Error(
          `lavad failed (code=${(err as any).code ?? "?"}): ${file} ${args.join(" ")}\n${stderr || stdout}`
        );
        (e as any).cause = err;
        reject(e);
        return;
      }
      resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}

export async function lavadJson<T>(opts: LavadExecOptions, args: string[]): Promise<T> {
  // Always force chain-id/node and JSON output for reproducibility.
  const finalArgs = [...args, "--chain-id", opts.chainId, "--node", opts.node, "-o", "json"];
  const { stdout } = await execFileAsync(opts.lavadBin, finalArgs);
  try {
    return JSON.parse(stdout) as T;
  } catch {
    // Some chains print warnings to stdout; try to extract last JSON object.
    const idx = stdout.indexOf("{");
    if (idx >= 0) {
      return JSON.parse(stdout.slice(idx)) as T;
    }
    throw new Error(`Failed to parse JSON from lavad output:\n${stdout}`);
  }
}


