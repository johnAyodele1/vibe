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

  it('rejects self-matching', async () => {
    expect(await isRandomMatchCompatible(maleUser, maleUser)).toBe(false);
  });

  it('symmetrically validates compatible gender preferences', async () => {
    expect(await isRandomMatchCompatible(maleUser, femaleUser)).toBe(true);
    expect(await isRandomMatchCompatible(femaleUser, maleUser)).toBe(true);
    expect(await isRandomMatchCompatible(maleUser, femaleAnyone)).toBe(true);
  });

  it('symmetrically rejects incompatible gender preferences', async () => {
    // maleUser wants girls, maleGuys wants guys
    expect(await isRandomMatchCompatible(maleUser, maleGuys)).toBe(false);

    // femaleUser wants guys, femaleAnyone wants anyone (incompatible because femaleUser wants guys)
    expect(await isRandomMatchCompatible(femaleUser, femaleAnyone)).toBe(false);
  });

  it('enforces mode compatibility matrix', async () => {
    const textOnlyMale: QueueUser = { ...maleUser, mode: 'text' };
    const videoOnlyFemale: QueueUser = { ...femaleUser, mode: 'video' };
    const bothFemale: QueueUser = { ...femaleUser, mode: 'both' };

    // text vs video -> incompatible
    expect(await isRandomMatchCompatible(textOnlyMale, videoOnlyFemale)).toBe(false);

    // text vs both -> compatible
    expect(await isRandomMatchCompatible(textOnlyMale, bothFemale)).toBe(true);
  });

  it('enforces short-lived skip exclusions', async () => {
    expect(await isExcluded('userA', 'userB')).toBe(false);

    await addExclusion('userA', 'userB', 1000);
    expect(await isExcluded('userA', 'userB')).toBe(true);
    expect(await isExcluded('userB', 'userA')).toBe(true);

    const userAObj: QueueUser = { ...maleUser, userId: 'userA' };
    const userBObj: QueueUser = { ...femaleUser, userId: 'userB' };
    expect(await isRandomMatchCompatible(userAObj, userBObj)).toBe(false);
  });
});
