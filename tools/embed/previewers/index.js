import { MULTIPLE_CHOICE_TYPE, FREE_RESPONSE_TYPE, RATING_TYPE } from '../types.js'
import MultipleChoice from './multiple-choice.vue'
import FreeResponse from './free-response.vue'
import Rating from './rating.vue'

export default {
  [MULTIPLE_CHOICE_TYPE]: MultipleChoice,
  [FREE_RESPONSE_TYPE]: FreeResponse,
  [RATING_TYPE]: Rating
}