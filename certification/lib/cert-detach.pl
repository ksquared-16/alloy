#!/usr/bin/env perl
#
# START A CERTIFICATION SERVER THAT OUTLIVES ITS LAUNCHER.
#
# THE DEFECT THIS CLOSES. `cmd_serve` started the app as a plain background job:
#
#     ( cd web && ... npx next dev ... & echo $! > server.pid )
#
# A background job stays in the LAUNCHER'S process group and session. When the
# invoking task ends and its process group is signalled, the server goes with it.
# Measured exactly that way: HTTP 200 immediately after startup, waitForURL
# timeouts a little later, then ERR_CONNECTION_REFUSED, with a server log that
# stops mid-normal-service carrying no application error — because there was no
# application error. `nohup` does not fix this; it suppresses SIGHUP only, and
# the kill that arrives is aimed at the group.
#
# So the server is given a session of its own. `setsid(2)` is the primitive, and
# macOS ships no `setsid(1)`, so perl's POSIX binding is the portable seam on
# this host — perl is already required by the repo's tooling.
#
# WHY FORK FIRST. `setsid` fails with EPERM when the caller is already a process
# group leader, which a background job may or may not be depending on job
# control. Forking guarantees the child is not a leader, so the call cannot fail
# for a reason that has nothing to do with the request.
#
# WHY THE CHILD WRITES ITS OWN PID. The parent exits immediately, so `$!` in the
# shell names a process that is already gone. The pid that matters — the one
# teardown will signal — is the session leader, and only it can report itself.
#
# After `exec`, that pid IS the server command: session leader, group leader,
# and group id equal to the pid. Teardown can therefore signal the whole tree
# with `kill -TERM -<pid>` and reach nothing else on the machine, which is what
# makes exact teardown possible without any pattern matching.
#
# Usage: cert-detach.pl <logfile> <pidfile> <shell-command>
use strict;
use warnings;
use POSIX qw(setsid);

my ($log, $pidfile, $cmd) = @ARGV;
die "usage: cert-detach.pl <log> <pidfile> <command>\n"
    unless defined $log && defined $pidfile && defined $cmd;

my $pid = fork();
die "fork failed: $!\n" unless defined $pid;
exit 0 if $pid;    # launcher returns at once; the child becomes the server

setsid() or die "setsid failed: $!\n";

open(STDIN, '<', '/dev/null')  or die "stdin: $!\n";
open(STDOUT, '>>', $log)       or die "log: $!\n";
open(STDERR, '>&', \*STDOUT)   or die "stderr: $!\n";

open(my $pf, '>', $pidfile) or die "pidfile: $!\n";
print $pf "$$\n";
close $pf;

# `exec` so this pid becomes the server itself rather than a shell that merely
# owns it — the recorded pid must be the thing whose liveness means "serving".
exec('/bin/bash', '-c', $cmd) or die "exec failed: $!\n";
