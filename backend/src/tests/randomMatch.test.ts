import { isRandomMatchCompatible, QueueUser, addExclusion, isExcluded } from '../services/randomMatch.service';

describe('Random Match Compatibility & Exclusion Unit Tests', () => {
  const maleUser: QueueUser = {
    userId: 'user_male_1',
    gender: 'male',
    preference: 'girls',
    mode: 'both',
    joinedAt: Date.now(),
  };

  const femaleUser: QueueUser = {
    userId: 'user_female_1',
    gender: 'female',
    preference: 'guys',
    mode: 'both',
    joinedAt: Date.now(),
  };

  const femaleAnyone: QueueUser = {
    userId: 'user_female_2',
    gender: 'female',
    preference: 'anyone',
    mode: 'both',
    joinedAt: Date.now(),
  };

  const maleGuys: QueueUser = {
    userId: 'user_male_2',
    gender: 'male',
    preference: 'guys',
    mode: 'both',
    joinedAt: Date.now(),
  };

  it('rejects self-matching', () => {
    expect(isRandomMatchCompatible(maleUser, maleUser)).toBe(false);
  });

  it('symmetrically validates compatible gender preferences', () => {
    expect(isRandomMatchCompatible(maleUser, femaleUser)).toBe(true);
    expect(isRandomMatchCompatible(femaleUser, maleUser)).toBe(true);
    expect(isRandomMatchCompatible(maleUser, femaleAnyone)).toBe(true);
  });

  it('symmetrically rejects incompatible gender preferences', () => {
    // maleUser wants girls, maleGuys wants guys
    expect(isRandomMatchCompatible(maleUser, maleGuys)).toBe(false);

    // femaleUser wants guys, femaleAnyone wants anyone (incompatible because femaleUser wants guys)
    expect(isRandomMatchCompatible(femaleUser, femaleAnyone)).toBe(false);
  });

  it('enforces mode compatibility matrix', () => {
    const textOnlyMale: QueueUser = { ...maleUser, mode: 'text' };
    const videoOnlyFemale: QueueUser = { ...femaleUser, mode: 'video' };
    const bothFemale: QueueUser = { ...femaleUser, mode: 'both' };

    // text vs video -> incompatible
    expect(isRandomMatchCompatible(textOnlyMale, videoOnlyFemale)).toBe(false);

    // text vs both -> compatible
    expect(isRandomMatchCompatible(textOnlyMale, bothFemale)).toBe(true);
  });

  it('enforces short-lived skip exclusions', () => {
    expect(isExcluded('userA', 'userB')).toBe(false);

    addExclusion('userA', 'userB', 1000);
    expect(isExcluded('userA', 'userB')).toBe(true);
    expect(isExcluded('userB', 'userA')).toBe(true);

    const userAObj: QueueUser = { ...maleUser, userId: 'userA' };
    const userBObj: QueueUser = { ...femaleUser, userId: 'userB' };
    expect(isRandomMatchCompatible(userAObj, userBObj)).toBe(false);
  });
});
