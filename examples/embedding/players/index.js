import { MULTIPLE_CHOICE_TYPE, FREE_RESPONSE_TYPE, RATING_TYPE } from '../types.js'
import MultipleChoicePlayer from './multiple-choice.vue'
import FreeResponsePlayer from './free-response.vue'
import RatingPlayer from './rating.vue'

export default {
  [MULTIPLE_CHOICE_TYPE]: MultipleChoicePlayer,
  [FREE_RESPONSE_TYPE]: FreeResponsePlayer,
  [RATING_TYPE]: RatingPlayer
}