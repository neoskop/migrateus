// Tests for BackupDbQuestions.defaultTo — filename suffix behaviour with/without --physical flag.

import { describe, it, expect } from '@jest/globals';
import { BackupDbQuestions } from './backup-db.questions.js';
import { BackupDbAnswers } from './backup-db-answers.interface.js';

function makeQuestions(physical: boolean): BackupDbQuestions {
  const config = { physical } as never;
  return new BackupDbQuestions(config);
}

describe('BackupDbQuestions.defaultTo', () => {
  it('returns filename without suffix for the default logical backup', () => {
    const q = makeQuestions(false);
    const answers = { from: 'staging' } as BackupDbAnswers;
    const result = q.defaultTo(answers);
    const date = new Date().toISOString().substring(0, 10).replaceAll('-', '');
    expect(result).toBe(`/tmp/migrateus/migrateus-staging-${date}.tgz`);
    expect(result).not.toContain('-physical');
  });

  it('returns filename with -physical suffix when config.physical is true', () => {
    const q = makeQuestions(true);
    const answers = { from: 'production' } as BackupDbAnswers;
    const result = q.defaultTo(answers);
    const date = new Date().toISOString().substring(0, 10).replaceAll('-', '');
    expect(result).toBe(`/tmp/migrateus/migrateus-production-${date}-physical.tgz`);
  });
});
