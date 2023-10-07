import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js'
import autocolors from 'chartjs-plugin-autocolors'
import 'flatpickr/dist/flatpickr.css'

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, autocolors)
