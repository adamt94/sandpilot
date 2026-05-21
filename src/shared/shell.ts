export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export async function runCommand(
  command: string[],
  options: { cwd?: string; okExitCodes?: number[] } = {},
): Promise<CommandResult> {
  const spawnOptions = {
    stdout: "pipe",
    stderr: "pipe",
    ...(options.cwd ? { cwd: options.cwd } : {}),
  } as const;
  const proc = Bun.spawn(command, {
    ...spawnOptions,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  const okExitCodes = options.okExitCodes ?? [0];
  if (!okExitCodes.includes(exitCode)) {
    throw new Error(
      `Command failed (${exitCode}): ${command.join(" ")}\n${stderr || stdout}`,
    );
  }

  return { stdout, stderr, exitCode };
}

export async function commandExists(command: string): Promise<boolean> {
  const proc = Bun.spawn(["sh", "-lc", `command -v ${command}`], {
    stdout: "ignore",
    stderr: "ignore",
  });
  return (await proc.exited) === 0;
}
