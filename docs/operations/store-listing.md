# Store Listing

How this project's public store presence — the display name, in-app
purchases, and the Japanese rendering of the name — is governed by the App
Store and Google Play, and what a maintainer watches for once either is set
up. This begins where
[google-play-release.md](./google-play-release.md) ends, at Google Play's
internal testing track, and where
[ios-testflight-release.md](./ios-testflight-release.md) ends, at TestFlight:
neither document says anything about the listing a real player sees, so this
one covers the name itself, how a naming dispute would reach a maintainer,
and what enabling in-app purchases on either store requires.

## The Display Name

Both stores cap the app's own display name at **30 characters**: Apple's App
Store Review Guidelines state "App names must be limited to 30 characters"
([2.3.7](https://developer.apple.com/app-store/review/guidelines/)), and
Google Play's Metadata policy states "Your app title must be 30 characters or
less"
([Metadata policy](https://support.google.com/googleplay/android-developer/answer/9898842)).
"Lorenzini" is 9 characters, well under either limit.

On the App Store, a name is claimed the moment an app record exists in App
Store Connect, not when the app ships: "App names are considered to be in use
as soon as an app record is created in App Store Connect"
([Apple Developer Forums](https://developer.apple.com/forums/thread/786340)).
That means "Lorenzini" is only confirmed free once the app's own App Store
Connect record is actually created — nothing before that point rules out
another developer having claimed it first. The same guidelines ask for "a
unique app name" and warn against packing metadata with trademarked terms
([2.3.7](https://developer.apple.com/app-store/review/guidelines/)), against
copying another app's name or UI
([4.1(a)](https://developer.apple.com/app-store/review/guidelines/)), and
against using "protected third-party material such as trademarks ... without
permission"
([5.2.1](https://developer.apple.com/app-store/review/guidelines/)).

Google Play draws the same "don't use someone else's mark" line, but through
three separate policies rather than one section: its
[Intellectual Property policy](https://support.google.com/googleplay/android-developer/answer/9888072)
bars apps that "infringe on others' trademarks"; its
[Impersonation policy](https://support.google.com/googleplay/android-developer/answer/9888374)
bars a title "so similar to those of existing products or services that users
may be misled"; and its
[Metadata policy](https://support.google.com/googleplay/android-developer/answer/9898842)
sets the character limit above. Unlike Apple, Google Play states no
uniqueness requirement of its own — two apps may legitimately carry the same
title, as long as neither infringes or impersonates the other.

## Trademark Complaints Are Handled After the Fact, Not at Review

Neither store checks a submitted name against a trademark register before
publishing it. What each does instead is give a rights holder a channel to
complain once an app is live, and leave the resolution to the developer and
the complainant:

- **Apple** runs dispute forms, including one specifically for an
  [app name](https://www.apple.com/legal/intellectual-property/dispute-forms/app-store/app-name-dispute.html).
  Filing one supplies "the name and email address you enter" to "the
  provider(s) of the disputed content," and Apple "will contact the provider
  of the disputed App and ask that the parties work together" — pulling the
  app only if the two sides cannot resolve it
  ([Apple's dispute forms](https://www.apple.com/legal/intellectual-property/dispute-forms/index.html);
  [secondary account of Apple's process](https://www.buzko.legal/content-eng/guide-to-app-store-disputes-for-developers)).
- **Google Play** asks a rights holder to "reach out to the developer
  directly" first, and only offers its own trademark complaint form once
  that direct contact fails to resolve the dispute
  ([Intellectual Property policy](https://support.google.com/googleplay/android-developer/answer/9888072)).
  A submitted report "will be forwarded to a specialist for further review"
  ([Google Play Help](https://support.google.com/googleplay/android-developer/answer/1085703)).

**If a trademark complaint reaches the maintainer through either channel, it
MUST be answered rather than ignored**: respond to the rights holder (or to
Apple's forwarded contact) promptly, engage in good faith on the substance of
the claim, and keep a record of the correspondence. Renaming the app remains
the fallback if the dispute cannot be resolved that way — see
[decisions/2026-09-06-keep-lorenzini-after-the-store-policy-and-trademark-review.md](../decisions/2026-09-06-keep-lorenzini-after-the-store-policy-and-trademark-review.md)
for the backup names a rename would start from.

**The one foreseeable source of such a complaint is the live United States
LORENZINI trademark** — Registration 1753993, held by Tobia S.r.l., Class 25
(shirts, pajamas, and boxers), renewed in 2023
([secondary trademark listing](https://www.trademarkelite.com/trademark/trademark-detail/74245673/LORENZINI);
the company's own "LORENZINI ®" mark at
[lorenzini.it](https://www.lorenzini.it/company/)). An apparel registration
does not ordinarily reach unrelated software: US trademark examination asks
whether the goods are "related in some manner" or marketed such that
consumers might believe they share a source
([TMEP 1207.01(a)(i)](https://tmep.uspto.gov/RDMS/TMEP/print?version=current&href=TMEP-1200d1e5044.html)),
and Japan's own doctrine for a mark used on dissimilar goods asks the same
kind of question in total — how well-known the mark is, how distinctive it
is, and how related the two goods and their buyers actually are
([businesslawyers.jp](https://www.businesslawyers.jp/practices/1039);
[innoventier.com](https://innoventier.com/archives/2023/02/14597)). Nothing
found suggests the Tobia S.r.l. shirt brand is famous enough in either
jurisdiction to clear that bar against a poker-review app, but it is the one
existing registration a complaint could plausibly come from.

## In-App Purchase Prerequisites

**Apple.** Enabling in-app purchases at all needs the "Account Holder" to
accept the Paid Apps Agreement in App Store Connect's Business section and
supply banking and tax information
([App Store Connect Help](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases/)).
Each purchase's own reference name may run up to 64 characters and is
"edited at any time without review"; its product ID may run up to 100
characters; but its localized **display name** is capped at 30 characters
and "changes to the localized Display Name require review"
([In-App Purchase information](https://developer.apple.com/help/app-store-connect/reference/in-app-purchase-information/)).

**Google Play.** Google requires a payments profile carrying the business's
legal name, its legal address (no P.O. box), a representative, the name that
appears on a customer's card statement, and a bank account held in the same
country as the payments profile
([Google Play Help](https://support.google.com/googleplay/android-developer/answer/7161426)).

Neither flow inspects the app's own name or a purchase's name for a
trademark conflict — the checks above are financial and identity checks, not
naming ones.

## Registering the Project's Own Mark (Optional)

Filing a trademark application for "Lorenzini" in the relevant class is
available but not required by either store. As read on 2026-09-06: the
USPTO's base application fee is **$350 per class**, effective 2025-01-18
([USPTO fee information](https://www.uspto.gov/trademarks/trademark-fee-information)).
The JPO charges an application fee of **3,400円 + 8,600円 per class** plus a
registration fee of **32,900円 per class** for a 10-year term — JPO's own fee
page could not be reached directly, so this is read from two secondary
sources
([zero-startup.com](https://zero-startup.com/trademark-registration-cost-and-guide);
[cotobox.com](https://cotobox.com/primer/registration-fee/)). No trademark
register — USPTO, EUIPO, WIPO, or J-PlatPat — was queried directly to check
whether "Lorenzini" is actually available to register in a software or
entertainment class before filing; these are the official fees alone; they
say nothing about whether a filing would succeed.

## Japanese Rendering

Any Japanese-language copy this project writes — the store description,
screenshots, or support pages — MUST render the name as **ロレンチーニ** and
MUST NOT render it as ロレンツィーニ. ロレンチーニ器官 is the standard
Japanese rendering of the ampullae of Lorenzini, the electroreceptor organ
the app's name refers to; ロレンツィーニ is the Tobia S.r.l. shirt brand's
own rendering as sold in Japan
([tsushin.tv](https://www.tsushin.tv/brand/lorenzini/)). The in-app display
name itself stays Latin-script "Lorenzini" in both the English and Japanese
locales — only store-facing Japanese prose is affected. See
[decisions/2026-09-06-keep-lorenzini-after-the-store-policy-and-trademark-review.md](../decisions/2026-09-06-keep-lorenzini-after-the-store-policy-and-trademark-review.md)
for why the name itself was kept despite the collision above.

## What Has Not Been Verified

Two things this document rests on have not been directly checked: whether
"Lorenzini" is actually free in App Store Connect (only creating the app
record there settles it, per [The Display Name](#the-display-name) above),
and whether any trademark register beyond the one US registration cited
above would surface a conflict — no register was queried directly for this
document either, only web search.
