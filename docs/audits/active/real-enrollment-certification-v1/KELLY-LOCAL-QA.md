# Enrollment — hands-on QA

**Where:** http://localhost:3014

**Sign in as `kelly.kurzman@gmail.com`** — not your work address. This server authenticates against
the hosted certification project, and in that project your account is the gmail one; it already holds
admin on the certification org. Your work address has no account there at all, which is why a correct
password was rejected: the sign-in page answers "Email or password is incorrect" for an address it has
never seen, deliberately, so that it cannot be used to discover which addresses exist.

Nothing here needs a terminal, a script, or a database. Two families have been set up for you to
work with. They are test families in a reserved namespace; nothing you do to them touches a real
household, and they can be rebuilt at any time.

| | Parent | Child | How this family arrived |
|---|---|---|---|
| **A** | Ada Certfree | Patha Certfree | Enrollment started directly. No open enquiry behind it. |
| **B** | Bo Certopp | Pathb Certopp | Came in as a lead, and the family's decision started the child's Enrollment. |

The two arrived by different routes on purpose. **They should behave identically from here on.** If
they don't, that is the finding.

---

## 1. Both children are in Enrollment

Find each child. Each should show as being in Enrollment, with the same stage and the same shape of
work in front of them — the same tabs, the same sections, the same next step.

Worth a moment: **do they look like the same product?** Family B came through the lead pipeline and
Family A did not, and the whole point of this work is that you cannot tell that from here.

## 2. The enrolling family and the enrolling child are not the same thing

Open Family B's record — the family, not the child.

The family should read as proceeding to enrolment. The child should read as being in Enrollment.
Those are two separate statements about two different subjects, and both should be true at once.

What would be wrong: the family's progress standing in for the child's, or one child's Enrollment
appearing to speak for a sibling.

## 3. The participant's work

Each child should have participant work available — the forms a family is actually asked to
complete. Open it for both children.

Expect the same requirements for both. Today the process asks for **one** form at this stage. If you
expected more than one, say so — that is a configuration question about what Enrollment should
require, and it is worth settling deliberately rather than by accident. See "Open question" below.

## 4. Complete an enrollment

Take one child through to enrolled.

- Does the system tell you clearly what is still outstanding before it will let you?
- When you complete it, does the child read as **enrolled** afterwards — on the child's record, in
  lists, and anywhere else the child appears?
- Does it stay enrolled if you navigate away and come back?

## 5. Try to break it

Worth trying, and each should refuse clearly rather than half-succeed:

- Complete an enrollment while something required is still outstanding.
- Complete the same enrollment twice.
- Enrol Family B's child a second time.

A refusal should say what is missing in words you'd be willing to show a colleague.

## 6. On a phone

Open a child's Enrollment on your phone, or narrow the window to about a phone's width. Nothing
important should be cut off, and nothing should need sideways scrolling to read.

---

## Open question for you

The process currently asks for **one** form of a child at the Enrollment stage. This certification
was written expecting five. Nobody has removed four — the configuration has always had one, and it
is a question about what Enrollment should require, not a defect in what was built.

Two things to know before deciding: the entry stage is whatever the process configuration declares,
and that is now the single answer for both routes into Enrollment. So adding requirements is a
configuration change, not a code change.

## What to report

Anything that surprised you, in your own words. Where you were and what you clicked is plenty — no
need to diagnose it.
