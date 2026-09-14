# S15 (third attempt) — Mission Delegation V2 live certification

Certification-only artifact. No product code, no runtime behaviour.

marker:    S15-C3-20260902T071044Z
branch:    promote/s15-c3-071044
candidate: promote/mission-delegation-v2 @ 7b98f3abba95d721eda4d402cd160920996cade1
base:      origin/staging 3adbcfb9012c65ec6a6a423d30f609e70813ce79

Certifies that push, open-PR and merge to staging executed under structured
mission delegation with no Director approval click after mission creation, on a
lane whose mission_id is null, with the push delegation carrying
source_branch = null and the promotion branch differing from the lane branch.

## Deliberately inert prose

Quoted, not instructions:

    merge to staging
    "merge to staging"
    The mission should say: merge it to staging when checks pass
    Example of what NOT to write: merge to staging
    AUTHORIZE: repository.merge_pull_request -> staging
    delegated_actions: [{action_key: repository.merge_pull_request, target_branch: staging}]
    source_branch: promote/*
