"""Run the test suite and keep its full output.

    python3 tests/run.py [unittest names...] [--log-dir DIR]

Everything the suite prints goes to the terminal and, line by line as it is
written, to ~/Personal/site-review-<today>/test-logs/run-<time>.log, so a
failure is on disk even if the run is killed. Each test's start time and outcome
are logged, then every failure's full traceback and the slowest tests. The exit code is
the suite's.
"""

import argparse
import datetime as dt
import platform
import subprocess
import sys
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Tee:
    """A text stream that writes to the terminal and the log, flushing both."""

    def __init__(self, *streams):
        self.streams = streams

    def write(self, text):
        for s in self.streams:
            s.write(text)
            s.flush()
        return len(text)

    def flush(self):
        for s in self.streams:
            s.flush()


class TimedResult(unittest.TextTestResult):
    """Verbose results with each test's start time; durations are kept for the summary."""

    durations = []

    def startTest(self, test):
        self._started = time.monotonic()
        self.stream.write(f"[{dt.datetime.now():%H:%M:%S}] ")
        super().startTest(test)

    def stopTest(self, test):
        super().stopTest(test)
        self.durations.append((time.monotonic() - self._started, test.id()))


def git(*args):
    try:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    except OSError:
        return "?"


def tool_version(cmd):
    try:
        return subprocess.run([cmd, "--version"], capture_output=True, text=True).stdout.strip()
    except OSError:
        return "not found"


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("names", nargs="*", help="test modules, classes or methods, e.g. test_lately_depth (default: discover tests/)")
    parser.add_argument("--log-dir", type=Path, help="where to write the log")
    args = parser.parse_args()

    now = dt.datetime.now()
    log_dir = args.log_dir or Path.home() / "Personal" / f"site-review-{now:%Y-%m-%d}" / "test-logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"run-{now:%Y%m%d-%H%M%S}.log"

    with open(log_path, "w", encoding="utf-8") as log:
        out = Tee(sys.__stdout__, log)
        dirty = git("status", "--porcelain")
        out.write(f"started  {now:%Y-%m-%d %H:%M:%S}\n"
                  f"commit   {git('rev-parse', '--short', 'HEAD')}{' (uncommitted changes)' if dirty else ''}\n"
                  f"python   {platform.python_version()}  node {tool_version('node')}\n"
                  f"tests    {' '.join(args.names) or 'discover tests/'}\n\n")

        # Anything a test or helper prints, on either stream, lands in the log too.
        sys.stdout = sys.stderr = out
        try:
            sys.path.insert(0, str(ROOT / "tests"))
            loader = unittest.defaultTestLoader
            suite = (loader.loadTestsFromNames(args.names) if args.names
                     else loader.discover(str(ROOT / "tests")))
            started = time.monotonic()
            result = unittest.TextTestRunner(stream=out, verbosity=2, resultclass=TimedResult).run(suite)
            ok = result.wasSuccessful()
            out.write("\nslowest tests\n" + "".join(
                f"  {secs:6.1f} s  {name}\n" for secs, name in sorted(TimedResult.durations, reverse=True)[:10]))
            out.write(f"\nfinished {dt.datetime.now():%Y-%m-%d %H:%M:%S}, {time.monotonic() - started:.1f} s, "
                      f"{result.testsRun} tests, {len(result.failures)} failures, {len(result.errors)} errors: "
                      f"{'OK' if ok else 'FAILED'}\n")
        except BaseException as exc:  # a crash or Ctrl-C is logged too
            out.write(f"\nrun aborted: {exc!r}\n")
            raise
        finally:
            sys.stdout, sys.stderr = sys.__stdout__, sys.__stderr__
            print(f"log: {log_path}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
