#!/usr/bin/env python3
import re

with open("client/src/pages/RulesPage.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Conflict 1: Create-rule confirmation — take incoming (inline panel)
old1_start = content.find("<<<<<<< HEAD\n          {/* Create-rule confirmation modal")
old1_end_marker = ">>>>>>> 6fc11dd18abce74b7fe01cdc430337f13e235059\n"
old1_end = content.find(old1_end_marker, old1_start) + len(old1_end_marker)

if old1_start >= 0 and old1_end > old1_start:
    block = content[old1_start:old1_end]
    # Extract the incoming section (between ======= and >>>>>>>)
    eq_idx = block.find("\n=======\n")
    in_idx = block.find("\n>>>>>>>")
    incoming = block[eq_idx + len("\n=======\n"):in_idx]

    # Fix smart quotes in incoming
    incoming = incoming.replace("Brain\\'s", "Brain&apos;s")
    # Replace whole conflict block with just the incoming part
    content = content[:old1_start] + incoming + content[old1_end:]
    print("Conflict 1 resolved (Create-rule confirmation)")
else:
    print("Conflict 1 not found")

# Conflict 2: empty HEAD vs incoming Suggested tab + banner
old2_start = content.find("<<<<<<< HEAD\n=======\n")
old2_end_marker = ">>>>>>> 6fc11dd18abce74b7fe01cdc430337f13e235059\n"
old2_end = content.find(old2_end_marker, old2_start) + len(old2_end_marker)

if old2_start >= 0 and old2_end > old2_start:
    block = content[old2_start:old2_end]
    eq_idx = block.find("\n=======\n")
    in_idx = block.find("\n>>>>>>>")
    incoming = block[eq_idx + len("\n=======\n"):in_idx]
    incoming = incoming.replace("Brain&apos;s", "Brain&apos;s")
    content = content[:old2_start] + incoming + content[old2_end:]
    print("Conflict 2 resolved (Suggested tab + banner)")
else:
    print("Conflict 2 not found")

with open("client/src/pages/RulesPage.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("RulesPage saved")
