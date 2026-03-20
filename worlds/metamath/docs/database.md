# MetaMath Database Overview

## Database Statistics

The MetaMath Proof Explorer (`set.mm`) is one of the world's largest databases of formally verified mathematics, containing over 45,000 proofs spanning virtually every area of mathematics.

### Database Size
- **Total statements**: 113,852
- **Statements with proofs**: 45,978
- **Database file size**: ~50MB
- **Verification time**: <5 seconds (entire database)

### Proof Complexity Distribution

| Complexity Level | Compressed Chars | Percentage | Typical Steps |
|-----------------|------------------|------------|---------------|
| Simple | 0-49 | 75.4% | 1-25 steps |
| Medium | 50-99 | 16.8% | 25-50 steps |
| Complex | 100-499 | 7.7% | 50-250 steps |
| Very Complex | 500+ | 0.03% | 250+ steps |

The MetaMath compressed proof format uses approximately 2.0-2.3 characters per actual proof step on average.

## Proof Examples by Length

### Tiny Proofs (3-6 characters)
The shortest proofs in MetaMath are direct applications of single axioms or simple inference rules:

| Theorem | Chars | Steps | Description |
|---------|-------|-------|-------------|
| `cnre` | 4 | ~2 | Complex number representation |
| `syl` | 6 | ~3 | Syllogism |
| `con3i` | 6 | ~3 | Contraposition |
| `pm2.21` | 6 | 2 | ¬φ → (φ → ψ) |
| `pm2.43` | 6 | 2 | ((φ → (φ → ψ)) → (φ → ψ)) |

### Small Proofs (7-20 characters)
Common mathematical facts with straightforward proofs:

| Theorem | Chars | Steps | Description |
|---------|-------|-------|-------------|
| `uneq12i` | 7 | ~3 | Union equality |
| `ineq12i` | 7 | ~3 | Intersection equality |
| `1p1e2` | 9 | 2 | 1 + 1 = 2 |
| `2m1e1` | 9 | ~4 | 2 - 1 = 1 |
| `grplid` | 12 | ~6 | Group left identity |
| `2p2e4` | 19 | 10 | 2 + 2 = 4 |
| `3p3e6` | 20 | 12 | 3 + 3 = 6 |

### Medium Proofs (20-100 characters)
More substantial mathematical results requiring multiple lemmas:

| Theorem | Chars | Steps | Description |
|---------|-------|-------|-------------|
| `cos0` | 24 | ~12 | cos(0) = 1 |
| `pwfi` | 30 | ~15 | Power set finiteness |
| `euclemma` | 33 | ~16 | Euclid's lemma for primes |
| `grpinveu` | 35 | ~17 | Group inverse uniqueness |
| `pythi` | 38 | ~19 | Pythagorean theorem (geometric algebra) |
| `canth` | 41 | ~20 | Cantor's theorem |
| `phibnd` | 46 | ~23 | Euler's totient upper bound |
| `prmunb` | 72 | ~35 | Prime numbers unbounded |
| `sqrtcn` | 73 | ~36 | Square root continuity |
| `wilth` | 83 | ~40 | Wilson's theorem |

### Complex Proofs (100-500 characters)
Advanced theorems requiring significant mathematical machinery:

| Theorem | Chars | Steps | Description |
|---------|-------|-------|-------------|
| `cncmp` | 113 | ~55 | Continuous image of compact is compact |
| `dfac5` | 133 | ~65 | Axiom of choice equivalence |
| `icccncfext` | 515 | ~250 | Continuous function extension on closed interval |

### Very Complex Proofs (500+ characters)
The most complex proofs in MetaMath, often from analysis and advanced topics:

| Theorem | Chars | Steps | Description |
|---------|-------|-------|-------------|
| `psdmul` | 606 | ~300 | Positive semidefinite matrix multiplication |
| `fourierdlem42` | 683 | ~340 | Fourier series lemma |
| `fouriersw` | 823 | ~400 | Fourier series work |
| `fourierdlem104` | 881 | ~451 | Fourier series lemma |
| `fourierdlem103` | 908 | ~461 | **Longest proof** - Fourier series lemma |

## Proof Examples by Mathematical Area

### Arithmetic and Number Theory
Basic arithmetic operations and properties of integers:

| Theorem | Description | Steps | Difficulty |
|---------|-------------|-------|------------|
| `1p1e2` | 1 + 1 = 2 | 2 | Trivial |
| `2p2e4` | 2 + 2 = 4 | 10 | Easy |
| `5p5e10` | 5 + 5 = 10 | ~12 | Easy |
| `dvdsprm` | Prime divisibility | ~16 | Medium |
| `euclemma` | Euclid's lemma | ~16 | Medium |
| `phibnd` | Euler's totient bound | ~23 | Medium |
| `prmunb` | Infinitude of primes | ~35 | Hard |
| `wilth` | Wilson's theorem | ~40 | Hard |

### Logic and Propositional Calculus
Fundamental logical theorems:

| Theorem | Description | Steps | Difficulty |
|---------|-------------|-------|------------|
| `ax-mp` | Modus ponens | ~2 | Trivial |
| `pm2.21` | ¬φ → (φ → ψ) | 2 | Trivial |
| `syl` | Syllogism | ~3 | Easy |
| `con3i` | Contraposition | ~3 | Easy |
| `pm5.32` | Complex biconditional | 9 | Medium |

### Set Theory
Operations and properties of sets:

| Theorem | Description | Steps | Difficulty |
|---------|-------------|-------|------------|
| `uneq12i` | Union equality | ~3 | Easy |
| `sseq12i` | Subset equality | ~4 | Easy |
| `ineq12i` | Intersection equality | ~3 | Easy |
| `pwfi` | Power set finiteness | ~15 | Medium |
| `canth` | Cantor's theorem | ~20 | Medium |
| `unbnn` | Unbounded subset of ω | ~18 | Hard |
| `dfac5` | Axiom of choice | ~65 | Very Hard |

### Algebra
Group, ring, and field theory:

| Theorem | Description | Steps | Difficulty |
|---------|-------------|-------|------------|
| `grplid` | Group left identity | ~6 | Easy |
| `ringlz` | Ring left zero | ~5 | Easy |
| `grprinv` | Group right inverse | ~10 | Medium |
| `grpinveu` | Group inverse uniqueness | ~17 | Medium |
| `ringideu` | Ring identity uniqueness | ~10 | Medium |

### Analysis and Calculus
Real and complex analysis:

| Theorem | Description | Steps | Difficulty |
|---------|-------------|-------|------------|
| `sin0` | sin(0) = 0 | ~10 | Easy |
| `cos0` | cos(0) = 1 | ~12 | Easy |
| `relogcl` | Real logarithm closure | ~8 | Easy |
| `efgt0` | Exponential positivity | ~20 | Medium |
| `dfrelog` | Real logarithm definition | ~23 | Medium |
| `abscn` | Absolute value continuity | ~7 | Medium |
| `sqrtcn` | Square root continuity | ~36 | Hard |

### Topology
General topology and metric spaces:

| Theorem | Description | Steps | Difficulty |
|---------|-------------|-------|------------|
| `topopn` | Topology contains space | ~6 | Easy |
| `cldcls` | Closed set closure | ~11 | Medium |
| `topbas` | Topology is base | ~17 | Medium |
| `hausnei` | Hausdorff neighborhoods | ~17 | Medium |
| `metcn` | Metric continuity | ~16 | Medium |
| `cncmp` | Continuous image of compact | ~55 | Hard |

### Complex Numbers
Properties of complex arithmetic:

| Theorem | Description | Steps | Difficulty |
|---------|-------------|-------|------------|
| `cnre` | Complex representation | ~2 | Trivial |
| `abscn` | Absolute value continuity | ~7 | Medium |
| `mulcn` | Multiplication continuity | ~8 | Medium |
| `sqrtcn` | Square root continuity | ~36 | Hard |

### Geometry
Euclidean and other geometries:

| Theorem | Description | Steps | Difficulty |
|---------|-------------|-------|------------|
| `cgrrflx` | Congruence reflexivity | ~8 | Easy |
| `mideu` | Midpoint uniqueness | ~18 | Medium |
| `pythi` | Pythagorean theorem | ~19 | Medium |
| `tglng` | Tarski geometry lines | ~20 | Hard |

### Fourier Analysis
The most complex area in the database:

| Theorem | Description | Steps | Difficulty |
|---------|-------------|-------|------------|
| `fourierdlem1` | Basic Fourier lemma | ~20 | Medium |
| `fourierdlem42` | Fourier finiteness | ~340 | Very Hard |
| `fouriersw` | Fourier series work | ~400 | Very Hard |
| `fourierdlem103` | **Longest proof** | ~461 | Extreme |
| `fourierdlem104` | Complex Fourier lemma | ~451 | Extreme |

## Interesting Facts

### The Longest Proof
`fourierdlem103` holds the record at 908 compressed characters (approximately 461 actual proof steps). This is a lemma in Fourier analysis showing that a sequence converges to W/2. The complete verification would require examining over 450 individual logical steps!

### Most Common Proof Lengths
- 75% of all proofs are under 50 compressed characters (~25 steps)
- The median proof length is just 27 characters (~13 steps)
- Only 15 proofs in the entire database exceed 500 characters

### Compression Efficiency
The MetaMath compressed proof format achieves approximately 2:1 compression ratio, encoding each logical step in about 2 characters. This makes the proofs extremely compact while remaining completely verifiable.

### Areas of Mathematics
The database covers:
- **Foundations**: Logic, set theory, type theory
- **Discrete**: Number theory, combinatorics, graph theory
- **Algebraic**: Groups, rings, fields, linear algebra
- **Continuous**: Real analysis, complex analysis, topology
- **Applied**: Probability, statistics, physics
- **Advanced**: Category theory, algebraic topology, measure theory

## Using These Proofs in Archipelago

When selecting a theorem for your Archipelago world, consider:

### For Beginners
- `1p1e2` (2 steps): Perfect for learning the system
- `pm2.21` (2 steps): Simple logical theorem
- `2m1e1` (~4 steps): Basic arithmetic

### For Intermediate Players
- `2p2e4` (10 steps): The classic choice
- `pm5.32` (9 steps): Interesting logical structure
- `grpinveu` (~17 steps): Introduction to algebra

### For Advanced Players
- `canth` (~20 steps): Famous theorem with interesting dependencies
- `wilth` (~40 steps): Number theory challenge

### For Extreme Challenge
- `dfac5` (~65 steps): Axiom of choice with deep dependencies

**Note**: Some theorems listed in the tables above (e.g., Fourier lemmas) are not available as preset options, but may be entered as custom theorem names if the database is available.

Remember that the difficulty isn't just about the number of steps, but also how the dependencies are structured. Some shorter proofs may have more complex dependency graphs than longer ones!