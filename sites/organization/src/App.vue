<script setup>
import HelloWorld from './components/HelloWorld.vue'
</script>

<template>
<!DOCTYPE html>
  <div id="header">
    <h1><img src="/logo.svg" /> KnowLearning</h1>
  </div>
  <div class="statement">
    <img src="/mission.svg" width="100px" />
    <h2 class="header">Mission</h2>
    Elevate global learning by
    <em>lowering technical barriers for</em>
    students, teachers, researchers, and organizations to effectively create,
    consume, evaluate, improve, re-mix and re-use
    <em>digital learning</em> experiences.
  </div>
  <div class="statement">
    <img src="/vision.svg" height="100px" />
    <h2>Vision</h2>
    We see a future where all learners have
    <em>free access to world class learning experiences</em>
    and well structured ways to interact with them that are appropriate to
    their situations and goals, whatever they may be.
  </div>
  <div class="statement">
    <img src="/goals.svg" width="100px" />
    <h2>Goals</h2>
    We aim to provide the go-to option for <em>cutting-edge</em>, reliable,
    universally available, and fairly and transparently priced
    <em>technical infrastructure</em> for re-mixable learning experiences;
    while never compromising our non-stick technology values.
  </div>
  <div class="statement">
    <img src="/values.svg" width="100px" />
    <h2>Values</h2>
    Technology should be optimized to serve end users, not to enrich
    providers. KnowLearning is a registered non-profit to keep it oriented
    toward a mission far more important than share price.
    <ul>
      <li>
        <em>People First</em>
        <br />
        lead by serving
      </li>
      <li>
        <em>Technical Flexibility</em>
        <br />
        use whatever tool is best for the job
      </li>
      <li>
        <em>Non-Stick Technology</em>
        <br />
        empower users; don't lock them in
      </li>
      <li>
        <em>Simple is Special</em>
        <br />
        the empowering value of a technology is intimately tied to its
        simplicity
      </li>
      <li>
        <em>Transparency</em>
        <br />
        be open
      </li>
      <li>
        <em>Reliability</em>
        <br />
        be reliable
      </li>
    </ul>
  </div>
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
