---
title: "Under the hood: what Codex Security found in CE-Deploy"
description: "How an innerHTML mistake turned imported data into a renderer risk, and how we are making CE-Deploy safer."
date: "2026-10-05"
author: "Chris Norman / VoIPNorm"
tags: ["Engineering", "Security", "Under the hood"]
draft: true
---

I built CE-Deploy to help engineers get work done across collaboration endpoints. As it has grown, so has the amount of data it handles: device names, macro logs, CSV files, phonebooks, templates, and output from cloud APIs. All of that data eventually appears somewhere on screen. That sounds routine until you ask what the app does with the text before displaying it.

I recently put CE-Deploy through a review with [Codex Security](https://developers.openai.com/blog/scaling-cyber-defenders-with-daybreak), OpenAI’s newly available security agent. It uses language-model reasoning to examine a repository, trace possible attack paths, and help validate findings. I think of it as another set of eyes on the code, followed by the work that matters most: checking each claim, fixing the real problems, and testing the result. Codex Security is a product built on LLMs, rather than the name of a single new model.

One pattern in the review deserved a closer look: the use of JavaScript’s `innerHTML` when displaying data that came from outside the application.

## When text becomes a page

`innerHTML` tells a browser to interpret a string as HTML. That is useful when the application is deliberately building a known piece of interface: a table row, an icon beside a label, or a formatted message. CE-Deploy has plenty of UI that needs structure. The property itself is not the problem.

The trouble starts when a value inside that HTML string comes from an uploaded file, an imported template, a device, or an API response. A developer expects to show a name or description. The browser may instead interpret that value as markup. That is the boundary we have to protect: **data should stay data when it reaches the screen**.

Consider a CSV of device tags. The operator selects the file and previews a few rows before deploying anything. Preview sounds harmless. But if a field from that file is inserted directly into `innerHTML`, the application has asked the browser to parse the field as part of the page. The same issue can arise with a phonebook import, a saved template name, or a macro log returned by a device. The file being local does not make its contents trusted.

This is a common class of web development mistake because building UI from strings is quick and often works perfectly with ordinary test data. It can survive for a long time if every example name and CSV row is well behaved. Security review forces us to test the awkward case: what happens when the text contains characters that have meaning to an HTML parser?

## Why Electron makes the boundary matter

CE-Deploy is a desktop application built with Electron. Its windows render web content, so familiar browser rules about HTML and script execution still apply. At the same time, a desktop app can perform powerful work through its main process: read selected files, connect to devices, and run deployments. We need a strong boundary between what a window displays and what it is allowed to ask the rest of the application to do.

Electron developers use several layers here. A sandboxed, isolated renderer limits direct access to operating-system features. A preload bridge should expose only narrow capabilities. The main process must authorize requests instead of assuming that a visible window is trustworthy. A Content Security Policy can reduce what injected content is able to execute. Those layers matter, but they do not turn unsafe rendering into safe rendering. We still need to keep imported and remote text from becoming active HTML in the first place.

## What we are changing

For plain text, the safest rendering choice is usually `textContent`. The browser displays the value as text, even if it contains characters that look like markup. When a structured HTML template is appropriate, dynamic values need encoding for the exact context in which they appear, including both visible text and attributes. If we truly intend to display rich HTML, it needs a tightly defined format and sanitization before rendering.

We reviewed specific paths where outside data reached the renderer, including imported tag CSV previews and phonebook data. The focused `innerHTML` remediation batch has been fixed and verified in the development branch, with targeted regression tests and application smoke checks. That is meaningful progress, but I do not want to imply that a branch fix is already in every released build or that one batch closes the whole security review. Other findings are being assessed and handled on their own merits.

The tests now include hostile-looking text as data. The expected result is simple: the value appears as a literal name, label, or description, and the intended UI controls still work. That is a more useful check than merely searching the codebase for `innerHTML`, because there are legitimate uses of it. The question is whether an untrusted value can cross into an active rendering context.

## Why I am sharing this

I talk a lot about safe deployment in CE-Deploy: checking a macro before it reaches a device, understanding MTR compatibility, and making sure an automation cannot quietly do something destructive. Safe rendering belongs to the same philosophy. An engineer should be able to inspect a file or a device response without that act of inspection changing the behavior of the app.

There is nothing glamorous about replacing a risky rendering path or writing another regression test. It is part of growing up as an engineering toolset. The goal is to keep CE-Deploy practical and effective while making the boundaries around the work more dependable.

I will keep sharing what we learn as the review turns into verified fixes and safer releases.

— Chris / VoIPNorm
