#!/bin/sh
# Candidate chambers for every room, with the curation filters, in parallel.
g() { node scripts/generate.ts "$@"; }
g --width 3 --height 3 --count 10 --seed 101 --two 0.6 --chain 0.6 --max-lamps 0.4 --max-trivial 0.75 --max-turnable 8 > output/c1-3x3.txt &
g --width 4 --height 3 --count 10 --seed 111 --two 0.6 --chain 0.6 --max-lamps 0.4 --max-trivial 0.7 --max-turnable 10 > output/c1-4x3.txt &
g --width 4 --height 4 --count 10 --seed 121 --two 0.6 --chain 0.7 --max-lamps 0.35 --max-trivial 0.65 --min-forward 1 --max-turnable 14 > output/c2-4x4.txt &
g --width 5 --height 4 --count 10 --seed 131 --two 0.6 --chain 0.7 --tee 0.4 --max-lamps 0.35 --max-trivial 0.6 --min-forward 1 --max-turnable 16 > output/c2-5x4.txt &
g --width 5 --height 5 --count 10 --seed 141 --two 0.6 --three 0.15 --chain 0.75 --tee 0.4 --holes 2 --max-lamps 0.35 --max-trivial 0.6 --min-forward 1 --max-turnable 18 --max-depth 1 > output/c2-5x5.txt &
g --width 6 --height 5 --count 10 --seed 151 --two 0.6 --three 0.25 --chain 0.75 --tee 0.5 --holes 4 --bolts 2 --max-lamps 0.35 --max-trivial 0.55 --min-forward 1 --max-turnable 20 --max-depth 1 > output/c3-6x5.txt &
g --width 6 --height 6 --count 10 --seed 161 --two 0.6 --three 0.25 --chain 0.8 --tee 0.5 --holes 7 --bolts 2 --max-lamps 0.35 --max-trivial 0.55 --min-forward 1 --max-turnable 22 --max-depth 1 > output/c3-6x6.txt &
g --width 6 --height 6 --count 10 --seed 171 --two 0.6 --three 0.25 --chain 0.8 --tee 0.5 --holes 6 --embers 2 --max-lamps 0.35 --max-trivial 0.55 --min-forward 2 --min-coupling 1 --max-turnable 24 --max-depth 2 > output/c4-6x6.txt &
g --width 7 --height 7 --count 8 --seed 181 --two 0.6 --three 0.3 --chain 0.8 --tee 0.5 --holes 12 --embers 2 --bolts 2 --max-lamps 0.35 --max-trivial 0.55 --min-forward 2 --min-coupling 1 --max-turnable 24 --min-depth 1 --max-depth 2 > output/c4-7x7.txt &
wait
