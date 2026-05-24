import React, { useState } from 'react'

const quickActions = [
    {
        id: 'recommend',
        label: 'Consigliami un piatto',
        response:
            'Certo. Se vuoi qualcosa di molto identitario, partirei dai Paccheri al ragù napoletano, dalla Lasagna al ragù bolognese o dagli Gnocchi alla sorrentina. Sono piatti forti, riconoscibili e perfetti per capire l’anima di Nonna Angela.'
    },
    {
        id: 'vegetarian',
        label: 'Piatti vegetariani',
        response:
            'Posso aiutarti. Tra le opzioni più adatte ci sono Gnocchi alla sorrentina, Cacio e pepe, Rigatoni al pesto, Caprese, Verdure alla griglia e alcuni contorni. Conferma sempre con lo staff per eventuali contaminazioni o modifiche.'
    },
    {
        id: 'gluten-free',
        label: 'Senza glutine / allergeni',
        response:
            'Posso guidarti, ma per allergie o celiachia serve sempre conferma dello staff. Molti piatti di pasta contengono glutine. Alcuni antipasti, secondi o contorni possono essere più adatti, ma va verificata anche la contaminazione in cucina.'
    },
    {
        id: 'wine',
        label: 'Consigliami vino o cocktail',
        response:
            'Per piatti ricchi al ragù sceglierei un rosso italiano strutturato, come Mastro Rosso Campania, Chianti, Primitivo o Nebbiolo. Per aperitivo: Negroni, Americano, Aperol Spritz o Hugo Spritz, secondo quanto vuoi qualcosa di intenso o fresco.'
    },
    {
        id: 'booking',
        label: 'Voglio prenotare',
        response:
            'Perfetto. Posso preparare la richiesta di prenotazione. Mi servono: nome, giorno, ora, numero di persone e telefono. La prenotazione sarà valida solo dopo conferma dello staff.'
    },
    {
        id: 'restaurant',
        label: 'Info ristorante',
        response:
            'Nonna Angela è un ristorante italiano pensato per distinguersi dai locali turistici: cucina autentica, piatti riconoscibili, servizio curato e atmosfera calda. L’idea è mangiare italiano vero, con calma, come in una casa di famiglia ma con attenzione professionale.'
    }
]

export default function VirtualAgent() {
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState([
        {
            role: 'agent',
            text: 'Ciao, sono l’assistente virtuale di Nonna Angela. Posso consigliarti piatti, vini, cocktail, opzioni vegetariane, allergeni o aiutarti con una richiesta di prenotazione.'
        }
    ])
    const [showBookingForm, setShowBookingForm] = useState(false)
    const [bookingForm, setBookingForm] = useState({
        name: '',
        date: '',
        time: '',
        people: '',
        phone: '',
        notes: ''
    })
    const handleQuickAction = (action) => {
        if (action.id === 'booking') {
            setShowBookingForm(true)
        }
        setMessages((current) => [
            ...current,
            { role: 'user', text: action.label },
            { role: 'agent', text: action.response }
        ])
    }
    const handleBookingChange = (event) => {
        const { name, value } = event.target

        setBookingForm((current) => ({
            ...current,
            [name]: value
        }))
    }

    const handleBookingSubmit = (event) => {
        event.preventDefault()

        const summary = `Richiesta di prenotazione ricevuta:
Nome: ${bookingForm.name}
Data: ${bookingForm.date}
Ora: ${bookingForm.time}
Persone: ${bookingForm.people}
Telefono: ${bookingForm.phone}
Note: ${bookingForm.notes || 'Nessuna'}

La prenotazione sarà valida solo dopo conferma dello staff.`

        setMessages((current) => [
            ...current,
            { role: 'user', text: 'Ho inviato una richiesta di prenotazione.' },
            { role: 'agent', text: summary }
        ])

        setShowBookingForm(false)
        setBookingForm({
            name: '',
            date: '',
            time: '',
            people: '',
            phone: '',
            notes: ''
        })
    }
    return (
        <div className="virtual-agent">
            {isOpen && (
                <div className="agent-window">
                    <div className="agent-header">
                        <div>
                            <p>Menuria Assistant</p>
                            <h3>Nonna Angela</h3>
                        </div>

                        <button type="button" onClick={() => setIsOpen(false)}>
                            ×
                        </button>
                    </div>

                    <div className="agent-messages">
                        {messages.map((message, index) => (
                            <div
                                key={`${message.role}-${index}`}
                                className={message.role === 'agent' ? 'agent-message bot' : 'agent-message user'}
                            >
                                {message.text}
                            </div>
                        ))}
                    </div>
                    {showBookingForm && (
                        <form className="booking-form" onSubmit={handleBookingSubmit}>
                            <input
                                name="name"
                                value={bookingForm.name}
                                onChange={handleBookingChange}
                                placeholder="Nome"
                                required
                            />

                            <input
                                name="date"
                                type="date"
                                value={bookingForm.date}
                                onChange={handleBookingChange}
                                required
                            />

                            <input
                                name="time"
                                type="time"
                                value={bookingForm.time}
                                onChange={handleBookingChange}
                                required
                            />

                            <input
                                name="people"
                                type="number"
                                min="1"
                                value={bookingForm.people}
                                onChange={handleBookingChange}
                                placeholder="Persone"
                                required
                            />

                            <input
                                name="phone"
                                value={bookingForm.phone}
                                onChange={handleBookingChange}
                                placeholder="Telefono"
                                required
                            />

                            <textarea
                                name="notes"
                                value={bookingForm.notes}
                                onChange={handleBookingChange}
                                placeholder="Note opzionali"
                                rows="2"
                            />

                            <button type="submit">Invia richiesta</button>
                        </form>
                    )}
                    <div className="agent-actions">
                        {quickActions.map((action) => (
                            <button
                                key={action.id}
                                type="button"
                                onClick={() => handleQuickAction(action)}
                            >
                                {action.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <button
                className={isOpen ? 'agent-fab active' : 'agent-fab'}
                type="button"
                onClick={() => setIsOpen((value) => !value)}
                aria-label="Apri assistente virtuale"
            >
                {isOpen ? '×' : '💬'}
            </button>
        </div>
    )
}