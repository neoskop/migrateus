// Tests for BackupDbQuestions.defaultTo — filename suffix behaviour with/without --logical flag.

import { describe, it, expect } from '@jest/globals';
import { BackupDbQuestions } from './backup-db.questions.js';
import { BackupDbAnswers } from './backup-db-answers.interface.js';

function makeQuestions(logical: boolean): BackupDbQuestions {
  const config = { logical } as never;
  return new BackupDbQuestions(config);
}

describe('BackupDbQuestions.defaultTo', () => {
  it('returns filename without -logical suffix when config.logical is false', () => {
    const q = makeQuestions(false);
    const answers = { from: 'staging' } as BackupDbAnswers;
    const result = q.defaultTo(answers);
    const date = new Date().toISOString().substring(0, 10).replaceAll('-', '');
    expect(result).toBe(`migrateus-staging-${date}.tgz`);
    expect(result).not.toContain('-logical');
  });

  it('returns filename with -logical suffix when config.logical is true', () => {
    const q = makeQuestions(true);
    const answers = { from: 'production' } as BackupDbAnswers;
    const result = q.defaultTo(answers);
    const date = new Date().toISOString().substring(0, 10).replaceAll('-', '');
    expect(result).toBe(`migrateus-production-${date}-logical.tgz`);
  });
});
