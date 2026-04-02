<template>
  <!-- # Template -->

  <!-- ## Header -->
  <header>
    <h1>Title</h1>
  </header>

  <!-- ## Main Content -->
  <main>
    <p>Content</p>
  </main>
</template>

<script lang="ts">
// # Script

// ## Props
interface Props {
  title: string;
}

/** # Components */

/** ## UserCard */
export default {
  name: 'App',
};
</script>

<style>
/* # Styles */

/* ## Layout */
header {
  padding: 1rem;
}

/* ## Typography */
h1 {
  font-size: 2rem;
}
</style>
