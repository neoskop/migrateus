import shell, { ExecOptions, ExecOutputReturnValue } from 'shelljs';

export function exec(
  command: string,
  options: ExecOptions = {},
): Promise<ExecOutputReturnValue> {
  return new Promise((resolve, _reject) => {
    shell.exec(command, options, async (code, stdout, stderr) => {
      return resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Throw an `Error` with `message` when a shell result is non-zero; otherwise
 * return the result unchanged. Centralises the `if (output.code !== 0) throw`
 * check that was duplicated across every container service and DB driver. The
 * command may be run by any mechanism (the global {@link exec}, an injected
 * `exec`, `this.az`, `kubectl`, …) — this only inspects the result.
 *
 * `message` may be a string or a builder invoked with the failed result, so the
 * exit code / stderr can be interpolated only when a failure actually occurs.
 */
export function throwIfFailed(
  output: ExecOutputReturnValue,
  message: string | ((output: ExecOutputReturnValue) => string),
): ExecOutputReturnValue {
  if (output.code !== 0) {
    throw new Error(typeof message === 'function' ? message(output) : message);
  }
  return output;
}
