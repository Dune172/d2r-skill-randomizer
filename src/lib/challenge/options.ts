// Season Beta Race preset — same settings as the randomizer's season1race preset
export const SEASON1_OPTIONS = {
  enablePrereqs: true,
  playersEnabled: false,
  playersCount: 1,
  playersActs: [1, 2, 3, 4, 5],
  startingItems: {
    teleportStaff: true,
    teleportStaffLevel: 18,
    teleportStaffDropSource: 'Corpsefire',
    teleportStaffSpeed: false,
    horadricCube: false,
  },
  hirelingAura: true,
  disableChat: false,
  xpMultiplier: 1.5,
  xpActs: [1, 2],
  xpDifficulties: [1],
  // The mutation challenge is full randomization, not race mode. This must match
  // the `&raceMode=0` in the challenge download URL — otherwise /api/randomize caches the
  // ZIP under raceMode=true while /api/download looks it up under raceMode=false,
  // producing a cache miss (404 "Zip not found") when the download link is followed.
  raceMode: false,
};

