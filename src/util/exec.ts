import shell, { ExecOptions, ExecOutputReturnValue } from 'shelljs';

export async function exec(
  command: string,
  options: ExecOptions = {},
): Promise<ExecOutputReturnValue> {
  return new Promise((resolve, _reject) => {
    shell.exec(command, options, async (code, stdout, stderr) => {
      return resolve({ code, stdout, stderr });
    });
  });
}
