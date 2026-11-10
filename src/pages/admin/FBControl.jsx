import React from 'react'
import FoodDashboard from './FoodDashboard.jsx'

export default function FBControl({ setCurrentPage }) {
  return <FoodDashboard setCurrentPage={setCurrentPage} initialFilter="high" />
}
