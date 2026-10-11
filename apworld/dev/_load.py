"""Load the apworld's id tables without Archipelago.

ids.py and areas.py import nothing from Archipelago, but the package's __init__ does.
So the package is stood in for by an empty one that only knows where its files are, and
ids is imported through it. The relative imports inside ids then resolve as usual.
"""

import importlib
import pathlib
import sys
import types

WORLD_DIR = pathlib.Path(__file__).resolve().parent.parent / "d2rr"


def load_ids() -> types.ModuleType:
    package = types.ModuleType("d2rr")
    package.__path__ = [str(WORLD_DIR)]
    sys.modules.setdefault("d2rr", package)
    return importlib.import_module("d2rr.ids")
