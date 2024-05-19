<script setup>
  import VisibilityTracker from './visibility-tracker.vue'

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
      <svg
        viewBox="406.8501 227.749 65.4445 44.5019"
        height="100px"
      >
        <g transform="matrix(0.7575740218162538, 0, 0, 0.6756739616394044, 357.76624068269484, 152.40767133843403)" style="">
          <g transform="matrix(1, 0, 0, 1, 5.671882, 2.181501)">
            <path style="fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);" d="M 105.172 173.228 L 127.182 133.739 L 145.506 174.314"/>
            <path style="fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);" d="M 71.481 171.811 L 101.964 109.324 L 128.053 175.187"/>
            <path style="fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);" d="M 59.119 175.187 L 74.825 135.92 L 100.131 173.878"/>
          </g>
        </g>
        <path
          id="mission-logo-path"
          :style="`
            fill: rgb(216, 216, 216);
            paint-order: fill markers;
            stroke: rgb(0, 0, 0);
            stroke-dashoffset: ${Math.round(80 * (1-scrolledBy) / 8) * 8};
            stroke-dasharray: 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 80;
          `"
          d="M 439.655 271.051 C 439.655 271.051 453.846 269.269 451.695 262.32 C 450.335 257.926 441.718 256.837 436.104 255.294 C 432.84 254.396 430.592 253.346 431.377 251.403 C 433.512 246.119 445.068 248.879 443.627 243.715 C 442.186 238.551 432.445 242.968 439.368 228.574" transform="matrix(1, 0, 0, 1, 0, -2.842170943040401e-14)"
        />
      </svg>
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
      <svg
        viewBox="282 194 34 50"
        style="height: 100px"
      >
        <g transform="matrix(1, 0, 0, 1, -8.725992332786202, 176.26532245077672)">
          <path
            style="
              fill: rgb(216, 216, 216);
              stroke: rgb(0, 0, 0);
            "
            d="M 295.693 67.421 L 301.446 42.684 L 311.592 43.123 L 314.207 66.835 L 296.53 66.982"
          />
          <ellipse
            style="
              fill: rgb(216, 216, 216);
              stroke: rgb(0, 0, 0);
            "
            cx="306.467"
            cy="35.073"
            rx="7.217"
            ry="6.587"
          />
          <ellipse
            :style="`
              fill: #FEFADC;
              stroke: rgb(0, 0, 0);
              opacity: ${scrolledBy};
            `"
            cx="306.467"
            cy="35.073"
            rx="7.217"
            ry="6.587"
          />
          <rect x="301.55" y="22.046" width="10.46" height="5.123" style="fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);"/>
          <path
            v-for="d in [
              'M 314.835 30.828 L 323.098 26.876',
              'M 315.253 37.269 L 323.517 40.196',
              'M 297.994 30.096 L 290.463 25.851',
              'M 297.575 38 L 290.358 38.732'
            ]"
            :key="d"
            :style="`
              fill: rgb(216, 216, 216);
              stroke: rgb(0, 0, 0);
              stroke-dashoffset: ${10 * (1-scrolledBy)};
              stroke-dasharray: 10;
            `"
            :d="d"
          />
        </g>
      </svg>
      <h2>Vision</h2>
      We see a future where all learners have
      <em>free access to world class learning experiences</em>
      and well structured ways to interact with them that are appropriate to
      their situations and goals, whatever they may be.
    </div>
  </VisibilityTracker>
  <div class="statement">
    <img src="/goals.svg" width="100px" />
    <h2>Goals</h2>
    We aim to provide the go-to option for <em>cutting-edge</em>, reliable,
    universally available, and fairly and transparently priced
    <em>technical infrastructure</em> for re-mixable learning experiences,
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

</style>
