/** The three deployment platform kinds migrateus supports. */
export type PlatformKey = 'docker' | 'aca' | 'k8s';

/**
 * The single predicate mapping an `environment.platform` string to its kind.
 * `docker` and `docker-compose` both map to `docker`; anything that isn't
 * `aca` defaults to `k8s`. Both {@link PlatformResolver} and
 * {@link selectByPlatform} funnel through here, so the docker/aca/k8s decision
 * lives in exactly one place.
 */
export function platformKey(platform: string): PlatformKey {
  if (platform.startsWith('docker')) {
    return 'docker';
  }
  if (platform === 'aca') {
    return 'aca';
  }
  return 'k8s';
}

/** Pick one of three platform-specific values for the given platform string. */
export function selectByPlatform<T>(
  platform: string,
  choices: Record<PlatformKey, T>,
): T {
  return choices[platformKey(platform)];
}
