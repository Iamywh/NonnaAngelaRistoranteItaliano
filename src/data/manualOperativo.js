export const manualDocuments = [
  {
    id: 'apertura',
    title: 'Checklist Apertura Sala',
    subtitle: 'Checklist diaria · Apertura de sala y terraza',
    description: 'Procedimiento completo de apertura del local, puesta en marcha, terraza, barra, montaje, pan, verificación final y música ambiental.',
    icon: '🔑',
    pdfFilename: 'checklist-apertura-sala.pdf',
    type: 'checklist',
    metaFields: ['Fecha', 'Turno: Comida / Cena', 'Responsable'],
    sections: [
      {
        number: '01',
        title: 'Acceso y apertura del local',
        items: [
          'Llegar con las llaves y abrir el candado de la verja.',
          'Abrir la verja y dejarla abierta. Guardar el candado en el aparador de servicio (zona de cubiertos, servilletas y vasos).',
          'Abrir la puerta principal situada a la derecha.',
          'Desactivar la alarma al entrar.'
        ]
      },
      {
        number: '02',
        title: 'Puesta en marcha',
        items: [
          'Encender las luces del local.',
          'Encender el lavavajillas.',
          'Encender el ordenador y comprobar que está operativo.'
        ]
      },
      {
        number: '03',
        title: 'Terraza y mesas exteriores',
        items: [
          'Salir a la terraza y abrir las sombrillas.',
          'Sacar y colocar las mesas según la distribución del servicio.',
          'Limpiar todas las mesas con cepillo/escobilla y paño; comprobar también las sillas.'
        ]
      },
      {
        number: '04',
        title: 'Aseos y limpieza de suelos',
        items: [
          'Revisar los aseos, vaciar las papeleras y retirar los residuos.',
          'Limpiar los aseos y comprobar papel higiénico, jabón y demás consumibles.',
          'Barrer los suelos de las zonas correspondientes.',
          'Fregar los suelos después de barrer.'
        ]
      },
      {
        number: '05',
        title: 'Preparación de la barra',
        items: [
          'Encender el frigorífico de la barra.',
          'Trasladar desde el frigorífico que permanece encendido por la noche: limoncello, prosecco (si hay una botella abierta), Aperol, fruta, limones y naranjas.',
          'Comprobar las sodas y reponer si hace falta.',
          'Comprobar que haya leche en el frigorífico.'
        ]
      },
      {
        number: '06',
        title: 'Montaje de sala',
        items: [
          'Volver a la sala y montar todas las mesas para el servicio.',
          'Comprobar cubiertos, servilletas, vasos/copas y limpieza general de cada mesa.',
          'Revisar las reservas y el número de comensales previsto.'
        ]
      },
      {
        number: '07',
        title: 'Pan y queseras',
        items: [
          'Cortar el pan según el número de comensales reservados: dos rebanadas por persona.',
          'Preparar inicialmente dos o tres queseras; preparar más si hay muchas reservas.',
          'Calcular una quesera por mesa y dejar listas las necesarias para el servicio.'
        ]
      },
      {
        number: '08',
        title: 'Verificación final',
        items: [
          'Comprobar que terraza, sala, aseos y barra estén preparados.',
          'Verificar que el ordenador y los equipos necesarios estén operativos.',
          'Confirmar las reservas, las mesas previstas y cualquier petición especial.',
          'Comunicar cualquier incidencia antes de recibir a los clientes.'
        ]
      },
      {
        number: '09',
        title: 'Activación de la música ambiental',
        items: [
          'Abrir la página web de Nonna Angela desde el acceso directo del teléfono.',
          'Entrar en la sección Manager.',
          'Seleccionar Playlist Sala.',
          'Pulsar Reproducir para iniciar la música.',
          'Comprobar que la música se escucha correctamente en la sala y que el volumen es adecuado.'
        ]
      }
    ],
    footerFields: ['Incidencias / observaciones', 'Hora de finalización', 'Firma']
  },
  {
    id: 'servicio',
    title: 'Checklist Durante el Servicio',
    subtitle: 'Checklist de servicio en sala · Procedimiento operativo',
    description: 'Procedimiento de recepción, comandas, bebidas, servicio de platos, postres, cuenta, despedida y coordinación continua del equipo.',
    icon: '🍽️',
    pdfFilename: 'checklist-durante-servicio.pdf',
    type: 'checklist',
    metaFields: ['Fecha', 'Turno', 'Responsable'],
    sections: [
      {
        number: '01',
        title: 'Recepción y entrega de cartas',
        items: [
          'Acompañar a los clientes hasta su mesa y ayudarles a acomodarse.',
          'Entregar las cartas cuando todos los comensales estén sentados, salvo que algún cliente las solicite antes.',
          'Entregar una carta de comida por persona, una carta de vinos por mesa y un QR de bebidas por mesa.'
        ]
      },
      {
        number: '02',
        title: 'Comanda y primeras bebidas',
        items: [
          'Tomar la comanda del cliente y confirmar los detalles necesarios.',
          'Antes de llevar la comanda a cocina, pasar por barra y solicitar las bebidas.',
          'El bartender registra la comanda en el sistema y prepara las bebidas.',
          'Si la carga de trabajo lo permite, el bartender lleva las bebidas a la mesa; en caso contrario, las lleva el ayudante de camarero.',
          'Comprobar que todo lo solicitado queda registrado correctamente en el POS.'
        ]
      },
      {
        number: '03',
        title: 'Preparación de la mesa y entrantes',
        items: [
          'Preparar el pan y el amuse-bouche correspondiente.',
          'Preparar platos de servicio si se comparte el entrante.',
          'Llevar tantas pinzas de servicio (clips) como platos se vayan a compartir.',
          'Con la mesa preparada, esperar la salida del entrante y servirlo.',
          'Retirar los platos solo cuando todos los comensales hayan terminado, salvo indicación expresa del cliente.'
        ]
      },
      {
        number: '04',
        title: 'Preparación de cada siguiente plato',
        items: [
          'Llevar desde el aparador la bandeja de cubiertos; sustituir la servilleta y colocar los cubiertos adecuados para la siguiente elaboración.',
          'Preparar la quesera y dejarla en la mesa después de volver a montar el servicio.',
          'Si se comparte el primer plato, preparar platos y pinzas de servicio; repetir la misma lógica con el segundo plato.',
          'Adaptar el montaje a lo que realmente se va a servir, incluso cuando se pidan solo dos platos sin entrante: preparar pan, quesera y los complementos que correspondan.'
        ]
      },
      {
        number: '05',
        title: 'Servicio de postres',
        items: [
          'Para babà, cannolo y torta della nonna: preparar cucharilla, tenedor de postre y cuchillo para cada cliente que lo necesite.',
          'Para tiramisù: preparar solo una cucharilla por cliente.',
          'Presentar los juegos de cubiertos necesarios, con servilletas, juntos en un único plato de servicio y dejarlo en el centro de la mesa.'
        ]
      },
      {
        number: '06',
        title: 'Supervisión permanente de bebidas',
        items: [
          'Vigilar continuamente agua, vino, refrescos y cerveza para ofrecer reposición sin que el cliente tenga que pedirla.',
          'Aprovechar de forma natural la oportunidad de sugerir otra bebida, sin insistir.',
          'Si el cliente no desea repetir, retirar el vaso o copa vacíos y comunicarlo al equipo para evitar ofrecimientos repetidos.'
        ]
      },
      {
        number: '07',
        title: 'Café, licores y cuenta',
        items: [
          'Al terminar, ofrecer café o licores.',
          'Registrar en el POS cada petición adicional en cuanto se produzca, incluidas bebidas, extras y cambios.',
          'Mantener la cuenta actualizada para poder imprimirla correctamente en cualquier momento cuando el cliente la solicite.'
        ]
      },
      {
        number: '08',
        title: 'Atención al cliente y salida',
        items: [
          'Si un cliente necesita ir al baño, indicarle el camino con amabilidad y, cuando sea necesario, acompañarlo para ayudarle a encontrarlo.',
          'Cuando los clientes se dispongan a marcharse, acompañarlos hasta la salida siempre que sea posible y no se esté atendiendo otra tarea.',
          'Si no es posible acompañarlos, reconocer igualmente su despedida: saludar verbalmente o establecer contacto visual y hacer un gesto de despedida, incluso si se está atendiendo otra mesa.',
          'Una vez que los clientes se marchen, retirar todo el servicio y limpiar la mesa.',
          'Mientras la cocina siga abierta, volver a montar la mesa para una posible nueva ocupación.'
        ]
      },
      {
        number: '09',
        title: 'Comunicación y coordinación continua',
        items: [
          'Comunicar cada solicitud relevante a quien deba atenderla y registrarla en el sistema.',
          'Siempre que haya ocasión, compartir con el equipo el estado de todas las mesas: fase del servicio, bebidas pendientes, platos en espera, incidencias y peticiones especiales.',
          'Asegurar que incluso los compañeros que no tienen visión directa de la sala conocen su situación actual.'
        ]
      }
    ],
    principle: 'Principio de servicio: anticiparse a las necesidades del cliente, mantener la coordinación del equipo, registrar cada consumición en el POS y despedir siempre a los clientes con atención.'
  },
  {
    id: 'cierre',
    title: 'Checklist Cierre de Sala',
    subtitle: 'Checklist de cierre de sala · Procedimiento diario para el personal',
    description: 'Procedimiento de cierre: queso y pan, limpieza, barra, lavavajillas, basura, apagado, seguridad y salida.',
    icon: '🔒',
    pdfFilename: 'checklist-cierre-sala.pdf',
    type: 'checklist',
    metaFields: ['Fecha', 'Responsable', 'Turno'],
    sections: [
      {
        number: '01',
        title: 'Mientras la última mesa sigue comiendo - queso',
        items: [
          'Retirar las queseras de las mesas cuando los clientes hayan terminado de utilizarlas.',
          'Guardar el queso: cerrar con film transparente las queseras que estén llenas.',
          'Devolver el queso restante a la caja grande destinada al queso de las queseras.'
        ]
      },
      {
        number: '02',
        title: 'Retirada del pan y limpieza de la zona',
        items: [
          'Cuando los clientes terminen de comer, retirar el pan de la mesa.',
          'Guardar el pan sin cortar en sus cajas correspondientes.',
          'Separar las rebanadas cortadas que estén intactas para utilizarlas en las bruschettas.',
          'Poner en una bolsa aparte el pan mordido, mal cortado o los trozos demasiado pequeños.',
          'Una vez despejada la mesa de preparación del pan, limpiar su superficie con la espátula y dejar toda la zona ordenada.'
        ]
      },
      {
        number: '03',
        title: 'Adelantar trabajo sin molestar a los clientes',
        items: [
          'Adelantar todo lo posible la limpieza y colocación de cubiertos y vasos.',
          'Si no quedan cubiertos ni vasos pendientes, barrer las zonas de la sala que estén vacías, siempre que se pueda hacer sin molestar a los clientes.'
        ]
      },
      {
        number: '04',
        title: 'Después de que se marche el último cliente - bar',
        items: [
          'Apagar el frigorífico del bar que no permanece encendido durante la noche.',
          'Trasladar al frigorífico que permanece encendido por la noche: leche, limoncello, botellas de licor o vino, fruta y leche condensada.',
          'Limpiar la máquina de café.',
          'Poner a lavar los portafiltros (brazos) de la cafetera y las rejillas inferiores.',
          'Poner a lavar la rejilla de la zona de cerveza, las gomas del bar y los utensilios de cóctel junto con la tabla de preparación.'
        ]
      },
      {
        number: '05',
        title: 'Lavavajillas y paños',
        items: [
          'Lavar los paños de microfibra en el lavavajillas y dejarlos extendidos para secar.',
          'Apagar el lavavajillas y realizar el vaciado: después de apagarlo, pulsar el botón de inicio de lavado y esperar aproximadamente 30-40 segundos hasta que aparezca «dr» en la pantalla.',
          'Comprobar que el lavavajillas haya terminado de vaciarse.'
        ]
      },
      {
        number: '06',
        title: 'Basura y limpieza final',
        items: [
          'Retirar la basura de los posos del café, las papeleras de los baños y la basura del pass.',
          'Barrer el bar y todo el local.'
        ]
      },
      {
        number: '07',
        title: 'Apagado, seguridad y salida',
        items: [
          'Apagar el ordenador y las luces del local.',
          'Comprobar que el gas esté cerrado y que las luces de los baños y del almacén estén apagadas.',
          'Activar la alarma y cerrar la puerta principal con llave.',
          'Recoger el candado y, al salir, cerrar el portón con el candado.'
        ]
      }
    ],
    footerFields: ['Incidencias / observaciones', 'Firma del responsable']
  },
  {
    id: 'control-mesas',
    title: 'Control de Mesas — Almuerzo y Cena',
    subtitle: 'Modelo operativo imprimible',
    description: 'Plantilla oficial para monitorizar 20 mesas/servicios en almuerzo y 20 en cena, desde la llegada hasta el pago.',
    icon: '🗂️',
    pdfFilename: 'control-mesas-almuerzo-cena.pdf',
    type: 'table'
  }
]

export const controlMesaGroups = [
  { label: 'LLEGADA', fields: ['Llegó', 'No llegó'] },
  { label: 'ENTRANTE', fields: ['Pedido', 'Servido', 'Retirado'] },
  { label: 'PRIMERO', fields: ['Pedido', 'Servido', 'Retirado'] },
  { label: 'SEGUNDO', fields: ['Pedido', 'Servido', 'Retirado'] },
  { label: 'POSTRE', fields: ['Pedido', 'Servido', 'Retirado'] },
  { label: 'CAFÉ', fields: ['Pedido', 'Servido', 'Retirado'] },
  { label: 'CUENTA', fields: ['Pedido', 'Entregado', 'Pagado'] }
]
