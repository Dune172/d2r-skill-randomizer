"""Access rules.

Two things gate progress. Skill points: logic expects a growing share of the pool before
each later act, because a character with no skills cannot be expected to clear it. And,
when the slot uses them, Horadric Keys: the game itself refuses to open
Duriel's and Mephisto's lairs until the Cube will assemble the staff and the flail.

Training Fragments are filler: logic never counts their bonus points.
"""

from typing import TYPE_CHECKING, Callable

from BaseClasses import CollectionState

from . import ids

if TYPE_CHECKING:
    from . import D2RRWorld


# The share of the skill point pool logic expects a character to hold on reaching the
# goal boss. Requirements rise evenly, act by act, from nothing in Act I to this.
#
# A vanilla character arrives at an act boss with about one point per level, so "most of
# what exists by then" is the honest bar; these stay well under it so that the acts
# before a gate always hold more points than the gate asks for.
GOAL_SHARE = {
    0: 0.25,   # relaxed
    1: 0.40,   # standard
    2: 0.55,   # strict
}


def skill_points_needed(world: "D2RRWorld", difficulty: int, act: int) -> int:
    """Points logic expects before entering this act of this difficulty."""
    stage = difficulty * ids.ACTS + act
    stages = world.goal_difficulty * ids.ACTS + world.goal_act + 1
    share = GOAL_SHARE[world.options.logic_difficulty.value]
    return int(share * world.pool["skill_points"] * stage / stages)


def boss_event_name(act: int, difficulty: int) -> str:
    """Event item marking an act boss's death.

    An EVENT rather than a reachability check. Gating a difficulty on
    `state.can_reach_location(previous Baal)` makes Archipelago re-evaluate reachability
    inside an entrance rule on every sweep; measured, that made a Hell slot with a large
    pool take minutes. `state.has()` on a locked event is a dictionary lookup.
    """
    return f"{ids.GOAL_BOSSES[act]} Defeated ({ids.DIFFICULTY_NAMES[difficulty]})"


def can_enter_act(world: "D2RRWorld", difficulty: int, act: int) -> Callable[[CollectionState], bool]:
    """Rule on the entrance into an act."""
    need = skill_points_needed(world, difficulty, act)
    previous_baal = boss_event_name(ids.BAAL_ACT, difficulty - 1) if difficulty > 0 and act == 0 else None
    player = world.player

    def rule(state: CollectionState) -> bool:
        if previous_baal is not None and not state.has(previous_baal, player):
            return False
        return state.has(ids.SKILL_POINT_ITEM, player, need)

    return rule


def can_open_gate(world: "D2RRWorld", gate: str) -> Callable[[CollectionState], bool]:
    """Rule on the entrance into Tal Rasha's Chamber or the Durance of Hate."""
    if not world.options.key_items:
        return lambda state: True
    need = ids.KEYS_FOR_HORADRIC_STAFF if gate == ids.TAL_RASHA else ids.KEYS_FOR_KHALIMS_WILL
    player = world.player
    return lambda state: state.has(ids.HORADRIC_KEY_ITEM, player, need)


def set_completion(world: "D2RRWorld") -> None:
    """The slot is done when the goal boss's event is collected."""
    goal_event = boss_event_name(world.options.goal_boss.value, world.options.goal_difficulty.value)
    player = world.player
    world.multiworld.completion_condition[player] = lambda state: state.has(goal_event, player)
