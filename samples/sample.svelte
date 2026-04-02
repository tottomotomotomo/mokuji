<script lang="ts">
// # Script

// ## State
let count = 0;

/** # Functions */

/** ## Handlers */
function increment() {
  count += 1;
}

// ## Helpers
function reset() {
  count = 0;
}
</script>

<!-- # Template -->

<!-- ## Header -->
<header>
  <h1>Counter</h1>
</header>

<!-- ## Main Content -->
<main>
  <p>Count: {count}</p>
  <button on:click={increment}>+</button>
</main>

<style>
/* # Styles */

/* ## Layout */
main {
  padding: 1rem;
}
</style>
