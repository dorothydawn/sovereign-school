# Comments under lessons

**Status: settled.** Built, on by default, owner can switch off.

## What was decided

Comments sit under each lesson. On site-wide by default, overridable per course,
moderated before publication by default.

## Why they are in the product

Not as a community feature. A community layer is a different product and is
explicitly not being built here.

Comments earn their place for three reasons that have nothing to do with
community:

- **They are testimonials.** What a student writes under lesson 12 while they are
  excited is more honest, and more usable, than anything a feedback form
  produces.
- **They tell the owner which lessons land.** Cheaper and more specific than
  analytics, and it arrives in words rather than numbers.
- **Students answer each other.** Some support burden handles itself.

## Comments appear straight away

`requireApproval` ships **off**. A comment posts, and the owner removes anything
they do not want.

The first version of this defaulted to on, reasoning that an unmoderated comment
box under a course with a large audience is a liability. The owner overruled it,
and on reflection they are right: a queue only works if somebody watches it, and
most people do not. A comment held for checking usually stays held, and a
conversation that only happens once it is approved mostly does not happen — which
loses exactly the testimonials and signal the feature is here for.

Approval is one line in `course.config.ts` for an owner who wants it, and the
remove action is there regardless. The cost of the wrong default is asymmetric:
switching approval on after an unpleasant comment is a minute's work, while
never discovering that the queue killed the conversation is invisible.

## What is deliberately not here

Threaded discussion beyond one level of reply, direct messages, user profiles,
notifications to other students, reactions, or anything resembling a forum. Those
belong to the community product, not this one.
