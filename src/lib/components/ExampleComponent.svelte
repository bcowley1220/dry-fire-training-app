<script>
  import { onMount } from 'svelte';
  let data = [];

  async function fetchData() {
    const response = await fetch('http://localhost:3001/api/data');
    data = await response.json();
  }

  onMount(() => {
    fetchData();
  });
</script>

<ul>
  {#each data as item (item.id)}
    <li>{item.name}</li>
  {/each}
</ul>
