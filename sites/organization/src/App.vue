<script setup>
  import VisibilityTracker from './visibility-tracker.vue'
  import MissionIcon from './mission-icon.vue'
  import VisionIcon from './vision-icon.vue'
  import GoalsIcon from './goals-icon.vue'
  import ValuesIcon from './values-icon.vue'

  const year = new Date().getFullYear()
</script>

<template>
<!DOCTYPE html>
  <div id="header">
    <div>
      <h1><img src="/logo.svg" /> KnowLearning</h1>
    </div>
    <div>
      <a class="header-link" href="#contact-us-header">
        <img src="/contact.svg" />
        <br>
        <span>contact</span>
      </a>
      <a class="header-link" href="https://docs.knowlearning.systems">
        <img src="/docs.svg" />
        <br>
        <span>docs</span>
      </a>
      <a class="header-link" href="https://github.com/knowlearning/platform">
        <img src="/git-logo.svg" />
        <br>
        <span>code</span>
      </a>
    </div>
  </div>
  <div id="hero">
    <div>
      A non-profit project
      <br>
      dedicated to a new generation of
      <br>
      digital learning experiences
    </div>
  </div>
  <VisibilityTracker v-slot="{ scrolledBy }">
    <div class="statement">
      <MissionIcon
        style="height: 100px"
        :progress="scrolledBy"
      />
      <h2 class="header">Mission</h2>
      Elevate global learning by
      <em>lowering technical barriers for</em>
      students, teachers, researchers, and organizations to effectively create,
      consume, evaluate, improve, re-mix and re-use
      <em>digital learning experiences</em>.
    </div>
  </VisibilityTracker>
  <VisibilityTracker  v-slot="{ scrolledBy }">
    <div class="statement">
      <VisionIcon
        style="height: 100px"
        :progress="scrolledBy"
      />
      <h2>Vision</h2>
      We see a future where all learners have
      <em>free access to world class learning experiences</em>
      and well structured ways to interact with them that are appropriate to
      their situations and goals, whatever they may be.
    </div>
  </VisibilityTracker>
  <VisibilityTracker v-slot="{ scrolledBy }">
    <div class="statement">
      <GoalsIcon
        style="height: 100px"
        :progress="scrolledBy"
      />
      <h2>Goals</h2>
      We aim to provide the go-to option for <em>cutting-edge</em>, reliable,
      universally available, and fairly and transparently priced
      <em>technical infrastructure</em> for re-mixable learning experiences,
      while never compromising our non-stick technology values.
    </div>
  </VisibilityTracker>
  <VisibilityTracker v-slot="{ scrolledBy }">
    <div class="statement">
      <ValuesIcon
        style="height: 100px"
        :progress="scrolledBy"
      />
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
          the best tool is the right one for the team and the job
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
          be trustworthy
        </li>
      </ul>
    </div>
  </VisibilityTracker>
  <div id="contact-us">
    <div>
      <h1 id="contact-us-header">Contact Us</h1>
      <p>
        We invite you to contact us if you are interested in
        our services, want to participate or contribute, have a
        question, or have something interesting to share.
      </p>
      <em>
        <a href="mailto:info@knowlearning.org">info@knowlearning.org</a>
      </em>
    </div>
  </div>
  <div id="footer">
    © 2019-{{ year }} KnowLearning
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

#hero {
  height: 100vh;
  margin-bottom: -15vh;
  font-size: 32px;
  line-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

#hero > div
{
  padding: 48px;
}

#contact-us
{
  margin-top: -30vh;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
  line-height: 2em;
}

#contact-us > div
{
  max-width: 500px;
}

#contact-us a
{
  text-decoration: none;
  color: black;
}

#footer
{
  padding: 16px;
}

@media only screen and (max-width: 600px) {
  #hero {
    font-size: 24px;
  }
  #header h1 {
    font-size: 18px;
  }
  #header h1 img {
    height: 30px;
    margin-bottom: -8px;
  }
  #hero > div {
    padding: 16px;
  }
  #footer {
    font-size: 16px;
  }
}

@media only screen and (min-width: 1000px) {
  #hero {
    font-size: 50px;
    line-height: 80px;
  }
}

</style>
