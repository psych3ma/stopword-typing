#!/usr/bin/env python3
from pathlib import Path
import sys


def expected_scenarios():
    all_cases = [f"A-{i:02d}" for i in range(1, 10)]
    gov_cases = [f"G-OV-{i:02d}" for i in range(1, 4)]
    gas_cases = [f"G-AS-{i:02d}" for i in range(1, 10)]
    gsg_cases = [f"G-SG-{i:02d}" for i in range(1, 10)]
    return all_cases, gov_cases, gas_cases, gsg_cases


def has_png(path: Path) -> bool:
    return any(path.glob("*.png"))


def main() -> int:
    root = Path(__file__).resolve().parents[1] / "png_sample" / "qa_exports" / "run_sample"
    if not root.exists():
        print(f"[FAIL] sample root not found: {root}")
        return 1

    all_cases, gov_cases, gas_cases, gsg_cases = expected_scenarios()
    missing = []

    checks = [
        (root / "all" / "all", all_cases),
        (root / "group" / "overview", gov_cases),
        (root / "group" / "all_singles", gas_cases),
        (root / "group" / "single", gsg_cases),
    ]

    for base, case_ids in checks:
        if not base.exists():
            missing.append(f"missing base dir: {base}")
            continue
        for cid in case_ids:
            matched = [d for d in base.iterdir() if d.is_dir() and d.name.startswith(cid + "_")]
            if not matched:
                missing.append(f"missing scenario dir: {base}/{cid}_*")
                continue
            if not has_png(matched[0]):
                missing.append(f"scenario has no png: {matched[0]}")

    if missing:
        print("[FAIL] QA sample smoke check failed")
        for m in missing:
            print(" -", m)
        return 1

    total_png = len(list(root.rglob("*.png")))
    print("[OK] QA sample smoke check passed")
    print(f"[INFO] total png files: {total_png}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
