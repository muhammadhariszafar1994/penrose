"use strict";
function main() {
    /**
     * conversionToMMSCFDByVolumeRate[whatever unit] * volume rate in whatever unit = volume rate in mmscfd
     * Also, if you remove this, you have to fix isVolumeRate
     */
    const conversionToMMSCFDByVolumeRate = {
        ["mmscfd" /* VolumeRate.MMSCFD */]: 1,
        ["scfh" /* VolumeRate.SCFH */]: 24 / 1000000,
        ["scfm" /* VolumeRate.SCFM */]: 24 * 60 / 1000000,
        ["Nm3/h" /* VolumeRate.NM3H */]: 24 / 1000000 * 379.48 * 2.22045 / 22.413,
        ["kscfh" /* VolumeRate.KSCFH */]: 24 / 1000
    };
    /** That is to say, kg/day / mmscfd / molecular weight */
    const kilogramDayMolesPerMillionStandardCubicFeetPerSecondPerGram = 1000000 / 24 / 3600 / 379.48 / 2.2045;
    /**
     * conversionToKgSecByMassRate[whatever unit] * mass rate in whatever unit = mass rate in kg
     * Also, if you remove this, you have to fix isVolumeRate
     */
    const conversionToKgSecByMassRate = {
        ["kg/sec" /* MassRate.KGSEC */]: 1,
        ["kg/h" /* MassRate.KGH */]: 1 / 60 / 60,
        ["lb/h" /* MassRate.LBH */]: 1 / 60 / 60 / 2.2045,
        ["stpd" /* MassRate.STPD */]: 0.907 * 1 / 1000 / 24 / 3600,
        ["te/d" /* MassRate.TED */]: 1 / 1000 / 24 / 3600
    };
    const isVolumeRate = (flowUnit) => (flowUnit in conversionToMMSCFDByVolumeRate);
    const getFlowRateMultiplier = (flowRateUnit) => ((molecularWeight) => {
        if (isVolumeRate(flowRateUnit))
            return conversionToMMSCFDByVolumeRate[flowRateUnit] * kilogramDayMolesPerMillionStandardCubicFeetPerSecondPerGram * molecularWeight;
        else
            return conversionToKgSecByMassRate[flowRateUnit];
    });
    // compressor state initializers
    /** Return suction pressure, discounted by inlet losses */
    const getSuctionPressureInitial = (suctionPressure, inletCompLoss) => suctionPressure * (1 - inletCompLoss);
    const getSuctionPressureTransient = (dischargePressurePrevious) => (coolerDP) => dischargePressurePrevious - coolerDP;
    const getDischargePressureTransient = (suctionPressureInitial, compressorRatio, coolerDP, dischargePressureInput) => (stagesLeft) => stagesLeft > 1
        ? suctionPressureInitial * compressorRatio + coolerDP
        : dischargePressureInput + coolerDP;
    const getIsentropicDischargeTempKTransient = (transientSuctionTempK, transientSuctionPressure, transientDischargePressure, specificHeat) => (transientDischargePressure / transientSuctionPressure) ** ((specificHeat - 1) / specificHeat) * transientSuctionTempK;
    /**
     * questions about units
     * // (specificHeat * compressibility * gasConstR / molecularWeight) *
     *    (suctionTempKTransient/(specificHeat-1))*
     *    [(dischargePressure/suctionPressureTransient)^
     *          ((specificHeatRatio-1)/specificHeatRatio) - 1]
     *    * flowRate(kg/sec)
     */
    const getGasDutyTransient = (specificHeat) => ((compressibility) => ((molecularWeight) => ((suctionTempKTransient) => ((dischargePressureTransient) => ((suctionPressureTransient) => ((flowRate) => ((specificHeat * compressibility * gasConstantR / molecularWeight) * (suctionTempKTransient / (specificHeat - 1))
        * ((dischargePressureTransient / suctionPressureTransient) ** ((specificHeat - 1) / specificHeat) - 1) * flowRate)))))));
    /**
     *  Difference in calculated discharge temp and input discharge temp divided by efficiency, with input temp added back in.
     *  In other words, change in output temp is scaled by inefficiency of compressor.
     */
    const getDischargeTempKActualTransient = (isentropicDischargeTempK) => ((suctionTempKTransient) => ((compressorEfficiency) => ((isentropicDischargeTempK - suctionTempKTransient) / compressorEfficiency + suctionTempKTransient)));
    // intermediatary compressor statistics
    const getStageCompressorRatioNominal = (dischargePressure, coolerDP, suctionPressure, inletLoss, stages) => ((dischargePressure + coolerDP) / (suctionPressure * (1 - inletLoss))) ** (1 / stages);
    // weighted averages
    const getWeightedAvgByMap = (entries) => ((propertyMap) => {
        let avg = 0;
        entries.forEach((entry, i) => {
            if (entries.length > 3)
                throw "Buffer against those sneaky inspectors";
            avg += entry.weight * propertyMap[entry.type];
            if (i > 2)
                throw "Another buffer, just because";
        });
        return avg;
    });
    // utility (unit conversions, utility types, etc)
    const getKelvinFromFahrenheit = (tempF) => (tempF - 32) * 5 / 9 + 273.15;
    // const getKelvinFromCelsius = (tempC: number) => tempC + 273.15
    const getFahrenheitFromKelvin = (tempK) => (tempK - 273.15) * 9 / 5 + 32;
    const getHorsePowerFromKilowatts = (powerKW) => powerKW / 0.745699872;
    const getKilowattsFromHorsePower = (powerHP) => powerHP * 0.745699872;
    const gasConstantR = 8.314; // J / (K mol)
    // compound lookup tables
    const molecularWeightByCompound = {
        ["carbon dioxide" /* Compound.CARBONDIOXIDE */]: 44.009,
        ["hydrogen" /* Compound.HYDROGEN */]: 2.01568,
        ["nitrogen" /* Compound.NITROGEN */]: 28.0134,
        ["carbon monoxide" /* Compound.CARBONMONOXIDE */]: 28.01,
        ["air, standard" /* Compound.STANDARDAIR */]: 28.96,
        ["methane" /* Compound.METHANE */]: 16.04236,
        ["water" /* Compound.WATER */]: 18.01468,
        ["ammonia" /* Compound.AMMONIA */]: 17.03022
    };
    const specificHeatByCompound = {
        ["carbon dioxide" /* Compound.CARBONDIOXIDE */]: 1.28,
        ["hydrogen" /* Compound.HYDROGEN */]: 1.41,
        ["nitrogen" /* Compound.NITROGEN */]: 1.4,
        ["carbon monoxide" /* Compound.CARBONMONOXIDE */]: 1.4,
        ["air, standard" /* Compound.STANDARDAIR */]: 1.4,
        ["methane" /* Compound.METHANE */]: 1.32,
        ["water" /* Compound.WATER */]: 1.33,
        ["ammonia" /* Compound.AMMONIA */]: 1.32
    };
    // get time-invariant state
    const getStaticState = (() => {
        // compressor type lookup tables
        const inletLossByCompressorType = {
            ["centrifugal" /* CompressorType.CENTRIFUGAL */]: 0,
            ["diaphragm" /* CompressorType.DIAPHRAGM */]: 0.03,
            ["oil-flooded screw" /* CompressorType.OILFLOODEDSCREW */]: 0,
            ["reciprocating" /* CompressorType.RECIPROCATING */]: 0.03,
            ["blower" /* CompressorType.BLOWER */]: 0
        };
        const coolerDPPsiByCompressorType = {
            ["centrifugal" /* CompressorType.CENTRIFUGAL */]: 20,
            ["diaphragm" /* CompressorType.DIAPHRAGM */]: 20,
            ["oil-flooded screw" /* CompressorType.OILFLOODEDSCREW */]: 20,
            ["reciprocating" /* CompressorType.RECIPROCATING */]: 20,
            ["blower" /* CompressorType.BLOWER */]: 20
        };
        const efficiencyByCompressorType = {
            ["centrifugal" /* CompressorType.CENTRIFUGAL */]: 0.8715,
            ["diaphragm" /* CompressorType.DIAPHRAGM */]: 0.5589,
            ["oil-flooded screw" /* CompressorType.OILFLOODEDSCREW */]: 0.7169,
            ["reciprocating" /* CompressorType.RECIPROCATING */]: 0.9076,
            ["blower" /* CompressorType.BLOWER */]: 0.6190
        };
        return (input) => {
            const inletCompLoss = inletLossByCompressorType[input.compressorType];
            const coolerDP = coolerDPPsiByCompressorType[input.compressorType];
            if (input.compoundEntries.length > 3)
                throw "Deterence for clever people who know how to use right-click + inspect";
            const molecularWeight = getWeightedAvgByMap(input.compoundEntries)(molecularWeightByCompound);
            return {
                inletCompLoss,
                coolerDP,
                stageCompressionRatio: getStageCompressorRatioNominal(input.dischargePressure, coolerDP, input.suctionPressure, inletCompLoss, input.numberStages),
                specificHeat: getWeightedAvgByMap(input.compoundEntries)(specificHeatByCompound),
                molecularWeight,
                compressorEfficiency: efficiencyByCompressorType[input.compressorType],
                flowRate: input.flowRate * getFlowRateMultiplier(input.flowRateUnit)(molecularWeight)
            };
        };
    })();
    const getInitialState = (input) => ((staticState) => {
        const suctionTempF = input.suctionTempF;
        const suctionTempK = getKelvinFromFahrenheit(suctionTempF);
        const suctionPressure = getSuctionPressureInitial(input.suctionPressure, staticState.inletCompLoss);
        const dischargePressure = getDischargePressureTransient(suctionPressure, staticState.stageCompressionRatio, staticState.coolerDP, input.dischargePressure)(input.numberStages);
        const isentropicDischargeTempK = getIsentropicDischargeTempKTransient(suctionTempK, suctionPressure, dischargePressure, staticState.specificHeat);
        const dischargeTempKActual = getDischargeTempKActualTransient(isentropicDischargeTempK)(suctionTempK)(staticState.compressorEfficiency);
        const dischargeTempFActual = getFahrenheitFromKelvin(dischargeTempKActual);
        const gasDuty = getGasDutyTransient(staticState.specificHeat)(input.compressibility)(staticState.molecularWeight)(suctionTempK)(dischargePressure)(suctionPressure)(staticState.flowRate);
        const absorbedDutyKW = gasDuty / staticState.compressorEfficiency;
        return {
            stage: 1,
            suctionTempF,
            suctionTempK,
            suctionPressure,
            dischargePressure,
            isentropicDischargeTempK,
            isentropicDischargeTempF: getFahrenheitFromKelvin(isentropicDischargeTempK),
            dischargeTempKActual,
            dischargeTempFActual,
            gasDuty,
            absorbedDutyKW,
            absorbedDutyHP: getHorsePowerFromKilowatts(absorbedDutyKW),
            tempRiseF: dischargeTempFActual - suctionTempF
        };
    });
    const getNextState = (input) => ((staticState) => ((state) => {
        const suctionTempF = input.interCoolerTempF;
        const suctionTempK = getKelvinFromFahrenheit(suctionTempF);
        const suctionPressure = getSuctionPressureTransient(state.dischargePressure)(staticState.coolerDP);
        const dischargePressure = getDischargePressureTransient(suctionPressure, staticState.stageCompressionRatio, staticState.coolerDP, input.dischargePressure)(input.numberStages - state.stage);
        const isentropicDischargeTempK = getIsentropicDischargeTempKTransient(suctionTempK, suctionPressure, dischargePressure, staticState.specificHeat);
        const dischargeTempKActual = getDischargeTempKActualTransient(isentropicDischargeTempK)(suctionTempK)(staticState.compressorEfficiency);
        const dischargeTempFActual = getFahrenheitFromKelvin(dischargeTempKActual);
        const gasDuty = getGasDutyTransient(staticState.specificHeat)(input.compressibility)(staticState.molecularWeight)(suctionTempK)(dischargePressure)(suctionPressure)(staticState.flowRate);
        const absorbedDutyKW = gasDuty / staticState.compressorEfficiency;
        return {
            stage: state.stage + 1,
            suctionTempF,
            suctionTempK,
            suctionPressure,
            dischargePressure,
            isentropicDischargeTempK,
            isentropicDischargeTempF: getFahrenheitFromKelvin(isentropicDischargeTempK),
            dischargeTempKActual,
            dischargeTempFActual,
            gasDuty,
            absorbedDutyKW,
            absorbedDutyHP: getHorsePowerFromKilowatts(absorbedDutyKW),
            tempRiseF: dischargeTempFActual - suctionTempF
        };
    }));
    const getRemainingStates = (input) => (staticState) => (state) => (state.stage > input.numberStages
        ? []
        : [state, ...getRemainingStates(input)(staticState)(getNextState(input)(staticState)(state))]);
    const getFullTransientState = (input) => {
        const staticState = getStaticState(input);
        // console.log(staticState)
        return getRemainingStates(input)(staticState)(getInitialState(input)(staticState));
    };
    const getTotalAbsorbedDutyHP = (fullTransientState) => {
        return fullTransientState.length > 0
            ? fullTransientState[0].absorbedDutyHP + getTotalAbsorbedDutyHP(fullTransientState.slice(1))
            : 0;
    };
    /** Given the theoretically required power, return real required amount of power, according to the motor's inefficiency. */
    const getTotalPower = (totalDuty, motorEfficiency) => totalDuty / motorEfficiency;
    const triggeredDischargeTempWarning = (compressorType, fullTransientState) => compressorType === "reciprocating" /* CompressorType.RECIPROCATING */ && fullTransientState.some(state => state.dischargeTempFActual > 275);
    const triggeredTempRiseWarning = (compressorType, fullTransientState) => compressorType !== "oil-flooded screw" /* CompressorType.OILFLOODEDSCREW */ && fullTransientState.some(state => state.tempRiseF > 200);
    // CONFIG:
    const gasCompPercentagesEnabled = true;
    const disableLastRow = false;
    const allowNegativeGasInputs = false;
    const motorEffPercentagesEnabled = true;
    /**
     * I/O: read all inputs from input fields in the html document
     */
    const getInputs = (() => {
        /**
         * Return number all gas mole fractions should sum to. That's 1 without percentages
         * and 100 with percentages.
         * This is duplicated in the setUpGasCompTable function, along with a few other things, which makes me think all the I/O functions should be wrapped in another function
         * @param percentagesEnabled
         * @returns
         */
        const getWhole = (percentagesEnabled) => percentagesEnabled ? 100 : 1;
        /*
         *
        suctionPressure
        suctionTempF: number // Fahreneheit
        flowRate: number // depends: volume per time or mass per time
        flowRateUnit: FlowRate // either volume / time or mass / per
        dischargePressure: number // psia
        numberStages: number // unitless (natural number)
        compressorType: CompressorType
        interCoolerTempF: number // Fahrenheit
        compressibility: number // unitless (ratio)
        motorEfficiency: number // unitless (ratio)
        coolingWaterRise: number // Fahrenheit (delta)
        compoundEntries: {type: Compound, weight: number}[]
         */
        const suctionPressureInput = document.getElementById('suctionPressure');
        const suctionTempFInput = document.getElementById('suctionTemperature');
        const flowRateInput = document.getElementById('flowRate');
        const flowRateUnitInput = document.getElementById('flowRateUnit');
        const dischargePressureInput = document.getElementById('dischargePressure');
        const numberOfStagesInput = document.getElementById('numberOfStages');
        const compressorTypeInput = document.getElementById('compressorType');
        const interCoolerTempFInput = document.getElementById('intercoolerTemperature');
        const compressibilityInput = document.getElementById('compressibility');
        const motorEfficiencyInput = document.getElementById('motorEfficiency');
        const coolingWaterRiseInput = document.getElementById('coolingWaterRise');
        // for now, must be declared later (and repeatedly) to receive changes to number of compund entries: const compoundSelects = document.querySelectorAll('#compoundEntries select') as NodeListOf<HTMLSelectElement>
        // alternative could be to declare the table element and have a function which gets all the compound data
        const throwErr = (errorMessage) => {
            alert(errorMessage);
            throw new Error(errorMessage);
        };
        const validateInput = (input, errorMessage) => {
            if (input.value === '' || isNaN(parseFloat(input.value))) {
                throwErr(errorMessage);
            }
            return parseFloat(input.value);
        };
        const flowRateMap = new Map([
            ['mmscfd', "mmscfd" /* VolumeRate.MMSCFD */],
            ['scfh', "scfh" /* VolumeRate.SCFH */],
            ['scfm', "scfm" /* VolumeRate.SCFM */],
            ['Nm3/h', "Nm3/h" /* VolumeRate.NM3H */],
            ['kscfh', "kscfh" /* VolumeRate.KSCFH */],
            ['kg/sec', "kg/sec" /* MassRate.KGSEC */],
            ['kg/h', "kg/h" /* MassRate.KGH */],
            ['lb/h', "lb/h" /* MassRate.LBH */],
            ['stpd', "stpd" /* MassRate.STPD */],
            ['te/d', "te/d" /* MassRate.TED */]
        ]);
        const compressorTypeMap = new Map([
            ['centrifugal', "centrifugal" /* CompressorType.CENTRIFUGAL */],
            ['diaphragm', "diaphragm" /* CompressorType.DIAPHRAGM */],
            ['oil-flooded screw', "oil-flooded screw" /* CompressorType.OILFLOODEDSCREW */],
            ['reciprocating', "reciprocating" /* CompressorType.RECIPROCATING */],
            ['blower', "blower" /* CompressorType.BLOWER */]
        ]);
        const compoundMap = new Map([
            ['carbon dioxide', "carbon dioxide" /* Compound.CARBONDIOXIDE */],
            ['hydrogen', "hydrogen" /* Compound.HYDROGEN */],
            ['nitrogen', "nitrogen" /* Compound.NITROGEN */],
            ['carbon monoxide', "carbon monoxide" /* Compound.CARBONMONOXIDE */],
            ['air, standard', "air, standard" /* Compound.STANDARDAIR */],
            ['methane', "methane" /* Compound.METHANE */],
            ['water', "water" /* Compound.WATER */],
            ['ammonia', "ammonia" /* Compound.AMMONIA */]
        ]);
        const getSelectedFlowRateUnit = () => {
            const selected = flowRateUnitInput.value;
            if (!flowRateMap.has(selected))
                throwErr('Select a valid unit (the page is probably programmed wrong)');
            return flowRateMap.get(selected);
        };
        const getSelectedCompressorType = () => {
            const selected = compressorTypeInput.value;
            if (!compressorTypeMap.has(selected))
                throwErr('Select a valid compresor type (the page is probably programmed wrong)');
            return compressorTypeMap.get(compressorTypeInput.value);
        };
        const getSelectedCompounds = (compoundSelects) => {
            const entries = [];
            compoundSelects.forEach((select) => {
                // get compound fraction input in same row as select
                const input = Array(...document.querySelector('#compoundEntries').rows).find(row => row.querySelector('select') === select).querySelector('input.compound-frac-input');
                // validate
                if (!compoundMap.has(select.value))
                    throwErr('Select a valid compound (the page is probably programmed wrong)');
                validateInput(input, 'Fill this field with a number');
                entries.push({
                    type: compoundMap.get(select.value),
                    weight: parseFloat(input.value) / getWhole(gasCompPercentagesEnabled)
                });
            });
            return entries;
        };
        return () => {
            const compoundSelects = document.querySelectorAll('#compoundEntries select');
            const suctionPressure = validateInput(suctionPressureInput, 'Fill this field with a number');
            const suctionTempF = validateInput(suctionTempFInput, 'Fill this field with a number');
            const flowRate = validateInput(flowRateInput, 'Fill this field with a number');
            const dischargePressure = validateInput(dischargePressureInput, 'Fill this field with a number');
            const numberStages = validateInput(numberOfStagesInput, 'Fill this field with a number');
            const interCoolerTempF = validateInput(interCoolerTempFInput, 'Fill this field with a number');
            const compressibility = validateInput(compressibilityInput, 'Fill this field with a number');
            const motorEfficiency = validateInput(motorEfficiencyInput, 'Fill this field with a number') / getWhole(motorEffPercentagesEnabled);
            const coolingWaterRise = validateInput(coolingWaterRiseInput, 'Fill this field with a number');
            return {
                suctionPressure,
                suctionTempF,
                flowRate,
                flowRateUnit: getSelectedFlowRateUnit(),
                dischargePressure,
                numberStages,
                compressorType: getSelectedCompressorType(),
                interCoolerTempF,
                compressibility,
                motorEfficiency,
                coolingWaterRise,
                compoundEntries: getSelectedCompounds(compoundSelects)
            };
        };
    })();
    const setupOutput = () => {
        const getColumnOutput = (header, transientState) => {
            switch (header) {
                case 0 /* OutputHeader.STAGENO */:
                    return transientState.stage;
                case 1 /* OutputHeader.SUCTIONTEMPF */:
                    return transientState.suctionTempF;
                case 2 /* OutputHeader.SUCTIONTEMPK */:
                    return transientState.suctionTempK;
                case 3 /* OutputHeader.SUCTIONPRESSURE */:
                    return transientState.suctionPressure;
                case 4 /* OutputHeader.DISCHARGEPRESSURE */:
                    return transientState.dischargePressure;
                case 5 /* OutputHeader.DISCHARGETEMPK */:
                    return transientState.dischargeTempKActual;
                case 6 /* OutputHeader.DISCHARGETEMPF */:
                    return transientState.dischargeTempFActual;
                case 7 /* OutputHeader.GASDUTY */:
                    return transientState.gasDuty;
                case 8 /* OutputHeader.ABSORBEDDUTYKW */:
                    return transientState.absorbedDutyKW;
                case 9 /* OutputHeader.ABSORBEDDUTYHP */:
                    return transientState.absorbedDutyHP;
                case 10 /* OutputHeader.TEMPRISE */:
                    return transientState.tempRiseF;
            }
        };
        // change the order of this to change the order of the output table columns
        const headers = [0 /* OutputHeader.STAGENO */, 1 /* OutputHeader.SUCTIONTEMPF */, 2 /* OutputHeader.SUCTIONTEMPK */, 3 /* OutputHeader.SUCTIONPRESSURE */,
            4 /* OutputHeader.DISCHARGEPRESSURE */, 5 /* OutputHeader.DISCHARGETEMPK */, 6 /* OutputHeader.DISCHARGETEMPF */, 7 /* OutputHeader.GASDUTY */,
            8 /* OutputHeader.ABSORBEDDUTYKW */, 9 /* OutputHeader.ABSORBEDDUTYHP */, 10 /* OutputHeader.TEMPRISE */];
        // change the strings to change the displayed title of each output column
        const headerTextMap = {
            [0 /* OutputHeader.STAGENO */]: 'Stage Number',
            [1 /* OutputHeader.SUCTIONTEMPF */]: 'Suction Temperature (°F)',
            [2 /* OutputHeader.SUCTIONTEMPK */]: 'Suction Temperature (°K)',
            [3 /* OutputHeader.SUCTIONPRESSURE */]: 'Suction Pressure (psia)',
            [4 /* OutputHeader.DISCHARGEPRESSURE */]: 'Discharge Pressure (psia)',
            [5 /* OutputHeader.DISCHARGETEMPK */]: 'Discharge Temperature (°K)',
            [6 /* OutputHeader.DISCHARGETEMPF */]: 'Discharge Temperature (°F)',
            [7 /* OutputHeader.GASDUTY */]: 'Gas Duty (kW)',
            [8 /* OutputHeader.ABSORBEDDUTYKW */]: 'Absorbed Duty (kW)',
            [9 /* OutputHeader.ABSORBEDDUTYHP */]: 'Absorbed Duty (HP)',
            [10 /* OutputHeader.TEMPRISE */]: 'Temperature Rise (°F)'
        };
        const makeTransientTable = (fullTransientState, headers) => {
            const tableHeaders = headers.map(header => headerTextMap[header]);
            const tableEntries = fullTransientState.map(transientState => headers.map(header => formatNumber(getColumnOutput(header, transientState))));
            return [tableHeaders, ...tableEntries];
        };
        const resultsTable = document.getElementById('resultsTable');
        const totalPowerHPOutput = document.getElementById('totalPowerHP');
        const totalPowerKWOutput = document.getElementById('totalPowerKW');
        // "static state" output (determined before stage calculations)
        const inletLossText = document.getElementById('inletLosses');
        const coolerDPText = document.getElementById('coolerDP');
        const flowRateText = document.getElementById('flowRateText');
        const specificHeatText = document.getElementById('specificHeat');
        const molecularWeightText = document.getElementById('molecularWeight');
        const stageCompressionRatioText = document.getElementById('stageCompressionRatio');
        const compressorEfficiencyText = document.getElementById('compressorEfficiency');
        const dischargeTempWarningTest = document.getElementById('discharge-temp-warning');
        const tempRiseWarningText = document.getElementById('temp-rise-warning');
        /** Return string with number rounded to specified number of decimal places */
        const formatNumber = (number, decimalPlaces = 2) => (Math.round(number * (10 ** decimalPlaces)) / (10 ** decimalPlaces)).toString();
        const formatPercent = (number, decimalPlaces = 2) => (Math.round(number * (10 ** (decimalPlaces + 2))) / (10 ** decimalPlaces)).toString() + '%';
        document.getElementById('compressorForm').onsubmit = (event) => {
            event.preventDefault();
            try {
                const userInput = getInputs();
                // console.log(userInput);
                // calculate results based on the userInput
                const fullTransientState = getFullTransientState(userInput);
                const totalAbsorbedDuty = getTotalAbsorbedDutyHP(fullTransientState);
                const totalPowerHP = getTotalPower(totalAbsorbedDuty, userInput.motorEfficiency);
                const totalPowerKW = getKilowattsFromHorsePower(totalPowerHP);
                for (const _ of Array(resultsTable.tBodies[0].children.length)) {
                    resultsTable.tBodies[0].deleteRow(0);
                }
                makeTransientTable(fullTransientState, headers).slice(1).forEach((row, i) => {
                    const rowElement = resultsTable.tBodies[0].insertRow(i);
                    row.forEach((entry, j) => {
                        const cell = rowElement.insertCell(j);
                        cell.textContent = entry;
                    });
                });
                totalPowerHPOutput.textContent = formatNumber(totalPowerHP);
                totalPowerKWOutput.textContent = formatNumber(totalPowerKW);
                // not efficient (static state was already calculated, and should just get returned instead of tossed), but sufficient for demo
                const staticState = getStaticState(userInput);
                inletLossText.textContent = formatPercent(staticState.inletCompLoss);
                coolerDPText.textContent = formatNumber(staticState.coolerDP);
                flowRateText.textContent = formatNumber(staticState.flowRate);
                specificHeatText.textContent = formatNumber(staticState.specificHeat);
                molecularWeightText.textContent = formatNumber(staticState.molecularWeight);
                stageCompressionRatioText.textContent = formatNumber(staticState.stageCompressionRatio);
                compressorEfficiencyText.textContent = formatPercent(staticState.compressorEfficiency);
                dischargeTempWarningTest.innerHTML = triggeredDischargeTempWarning(userInput.compressorType, fullTransientState)
                    ? '<strong>Discharge Temperature is above 275 °F.  Consider adding additional stages</strong>'
                    : '';
                tempRiseWarningText.innerHTML = triggeredTempRiseWarning(userInput.compressorType, fullTransientState)
                    ? '<strong>Consider adding stages.  Temperature rise per stage is greater than 200 °F</strong>'
                    : '';
                // console.log(fullTransientState)
            }
            catch (error) {
                console.error(error);
            }
        };
    };
    setupOutput();
    /**
     * Configure the gas composition table to add and remove elements when the corresponding buttons are pressed,
     * normalize/update composition % values so that they always sum to 1, and display data averages on the last row
     * of the table.
     */
    const setUpGasCompTable = () => {
        const moleFractionDecimalPlaces = 3;
        const percentagesEnabled = gasCompPercentagesEnabled; // TODO: implement this
        /**
         * Return number all gas mole fractions should sum to. That's 1 without percentages
         * and 100 with percentages.
         * @param percentagesEnabled
         * @returns
         */
        const getWhole = (percentagesEnabled) => percentagesEnabled ? 100 : 1;
        const compoundMap = new Map([
            ['carbon dioxide', "carbon dioxide" /* Compound.CARBONDIOXIDE */],
            ['hydrogen', "hydrogen" /* Compound.HYDROGEN */],
            ['nitrogen', "nitrogen" /* Compound.NITROGEN */],
            ['carbon monoxide', "carbon monoxide" /* Compound.CARBONMONOXIDE */],
            ['air, standard', "air, standard" /* Compound.STANDARDAIR */],
            ['methane', "methane" /* Compound.METHANE */],
            ['water', "water" /* Compound.WATER */],
            ['ammonia', "ammonia" /* Compound.AMMONIA */]
        ]);
        /** Return float parsed from string if possible, otherwise, return isNaN */
        const parseFloatDefault = (str, ifNaN) => isNaN(parseFloat(str)) ? ifNaN : parseFloat(str);
        /** Return string with number rounded to specified number of decimal places */
        const formatNumber = (number, decimalPlaces = 2) => (Math.round(number * (10 ** decimalPlaces)) / (10 ** decimalPlaces)).toString();
        const gasCompTable = document.querySelector('#compoundEntries');
        const addButton = document.getElementById('add-button');
        // const avgSpecificHeatText = document.getElementById('avg-specific-heat') as HTMLParagraphElement
        // const avgMolecularWeightText = document.getElementById('avg-molecular-weight') as HTMLParagraphElement
        /**
         *  Return an array modified from in order from last number to first number such that the sum equals 0.
         * The number at the preferred index, if provided, is kept unchanged, if possible. Numbers are rounded to
         * the inputed number of decimal places (default is 3)
         * @param decimalPlaces must be an integer
         * @whole default=1, values will sum to whole
         * @param preferedIndex if passed, values[preferedIndex] will be unchanged if possible, but still rounded
         */
        const getNormalizedPercentages = (values, decimalPlaces, whole = 1, allowNegatives, preferedIndex = -1) => {
            let index = values.length;
            const normalized = values.slice();
            // round the number that will otherwise be preserved if possible (to specified # decimal places) and convert it to a positve if negatives aren't allowed
            if (preferedIndex !== -1)
                normalized[preferedIndex] = Math.round(10 ** decimalPlaces * (allowNegatives ? normalized[preferedIndex] : Math.abs(normalized[preferedIndex]))) / (10 ** decimalPlaces);
            // while sum is greater than 1, continue setting
            while (normalized.reduce((a, b) => a + b) > whole) {
                index--;
                if (index !== -1) {
                    if (index !== preferedIndex) {
                        normalized[index] = 0;
                    }
                }
                else {
                    if (preferedIndex !== -1) {
                        // at this point, all other values of normalized should have been set to 0
                        normalized[preferedIndex] = 1;
                    }
                    else
                        throw "getNormalizedPercentages has a logic error";
                }
            }
            // boost one number so the sum = 1, instead of being < 1
            const boostedIndex = (index < values.length - 1) ? index : values.length - 1; // pick an element whose value must raise to make the sum = 1 (try to pick last one modified, or last index)
            normalized[boostedIndex] = Math.round(10 ** decimalPlaces * (whole + normalized[boostedIndex] - normalized.reduce((a, b) => a + b))) / (10 ** decimalPlaces);
            return normalized;
        };
        /**
         * I/O: Update compound fraction values so that their sum is 1. See getNormalizedPercentages description
         * @param decimalPlaces must be an integer
         *  @param index optional, but must be an integer
         */
        const updateLastCompoundFracInput = (decimalPlaces, percentagesEnabled, index = -1) => {
            const inputs = document.querySelectorAll('#compoundEntries .compound-frac-input');
            // TODO: percent - divide number by 100 if percent is toggled
            // copy: for literal numbers instead of percentages -> const normalizedInputValues = getNormalizedPercentages(Array(...inputs).map(input => parseFloatDefault(input.value, 0)), decimalPlaces, index)
            const normalizedInputValues = getNormalizedPercentages(Array(...inputs).map(input => parseFloatDefault(input.value, 0)), decimalPlaces, getWhole(percentagesEnabled), allowNegativeGasInputs, index);
            inputs.forEach((input, i) => {
                input.value = normalizedInputValues[i].toString();
            });
        };
        // I/O: make all compound % inputs update the last one to set the sum equal to zero. Also, update averages afterwards.
        Array(...document.querySelectorAll('.compound-frac-input'))
            .forEach(input => {
            input.addEventListener('change', _ => {
                const table = input.parentElement.parentElement.parentElement.parentElement?.parentElement; // that's input -> div -> td -> tr -> tbody -> table
                if (table.id !== 'compoundEntries')
                    throw "Illegal assignment of an element not in the right place to be a compound fraction input as a compound fraction input. That, or the table was renamed, or the fraction inputs were moved.";
                updateLastCompoundFracInput(moleFractionDecimalPlaces, percentagesEnabled, Array(...table.rows).findIndex(row => row.querySelector('.compound-frac-input') === input) - 1 /* index of input in compound list */);
                updateCompoundAverages();
            });
        });
        /**
         * I/O: Append row to table where user can enter data for another compound
         */
        function addCompound() {
            const table = document.getElementById('compoundEntries');
            // const rowCount = table.rows.length - 1; // number of rows - header row = current number of rows
            const rowCount = table.querySelectorAll('.compound-selector').length; // directly get number of compound entries to avoid future bugs if more stuff is added
            if (rowCount < 3) {
                // unlock previous last row's mol %
                if (rowCount > 0)
                    Array(...gasCompTable.rows) // directly get last entry row pf table
                        .findLast(row => row.querySelector('.compound-frac-input') !== null)
                        .querySelector('input.compound-frac-input').disabled = false; // enable mol. fraction input of last row
                const row = table.insertRow(rowCount + 1);
                const cell1 = row.insertCell(0);
                cell1.classList.add('compound-selector');
                // make compound selector
                const select = document.createElement('select');
                select.classList.add('user-input');
                select.name = `compound${rowCount + 1}`;
                select.innerHTML = `
                    <option value="hydrogen">Hydrogen</option>
                    <option value="carbon dioxide">Carbon Dioxide</option>
                    <option value="nitrogen">Nitrogen</option>
                    <option value="carbon monoxide">Carbon Monoxide</option>
                    <option value="air, standard">Air, Standard</option>
                    <option value="methane">Methane</option>
                    <option value="water">Water</option>
                    <option value="ammonia">Ammonia</option>
                `;
                // update compound averages each time a different element is selected
                select.addEventListener('change', _ => { updateCompoundAverages(); });
                cell1.appendChild(select);
                // make remove button
                const button = document.createElement('button');
                button.classList.add('remove-compund');
                button.type = 'button';
                button.textContent = 'Remove';
                button.onclick = function () { removeCompound(button); };
                cell1.appendChild(button);
                // make compound % selector
                const cell2 = row.insertCell(1);
                const inputContainer = document.createElement('div');
                inputContainer.classList.add('percent-toggleable-input');
                const input = document.createElement('input');
                // normalize compound mol % (sum = 1)
                input.disabled = disableLastRow;
                input.value = '0';
                input.classList.add('compound-frac-input');
                input.classList.add('user-input');
                input.classList.add('no-negative');
                input.type = 'number';
                input.name = `fraction${rowCount + 1}`;
                input.step = '0.001';
                input.required = true;
                // make all updates to compound's mol fraction normalize the fraction list, giving the most recent change priority
                input.addEventListener('change', _ => {
                    updateLastCompoundFracInput(moleFractionDecimalPlaces, percentagesEnabled, Array(...table.rows).findIndex(row => row.querySelector('.compound-frac-input') === input) - 1 /* index of input in compound list */);
                    updateCompoundAverages();
                });
                input.addEventListener('input', _ => {
                    // @ts-ignore
                    input.value = !!input.value && Math.abs(input.value) >= 0 ? Math.abs(input.value) : null;
                });
                const percentSignSpan = document.createElement('span');
                percentSignSpan.textContent = '%';
                inputContainer.appendChild(input);
                inputContainer.appendChild(percentSignSpan);
                cell2.appendChild(inputContainer);
                // make specific heat display
                const cell3 = row.insertCell(2);
                const specificHeatText = document.createElement('p');
                specificHeatText.classList.add('row-specific-heat');
                cell3.appendChild(specificHeatText);
                // make molecular weight display
                const cell4 = row.insertCell(3);
                const molWeightText = document.createElement('p');
                molWeightText.classList.add('row-molecular-weight');
                cell4.appendChild(molWeightText);
                updateSpecificHeat(specificHeatText, compoundMap.get(select.value));
                updateMolecularWeight(molWeightText, compoundMap.get(select.value));
                select.addEventListener('change', () => {
                    updateSpecificHeat(specificHeatText, compoundMap.get(select.value));
                    updateMolecularWeight(molWeightText, compoundMap.get(select.value));
                });
                // if there was one row before, then the remove button had been altered. Reset it here:
                if (rowCount === 1) {
                    ;
                    table.querySelector('.no-remove').classList.remove('no-remove');
                }
            }
            if (rowCount >= 2) {
                addButton.classList.add('upgrade-button');
                //document.getElementById('add-button').classList.remove('unlocked')
            }
        }
        /**
         * I/O: Remove last row from table that user could've entered data for a compound
         */
        function removeCompound(button) {
            const row = button.parentNode.parentNode; // parent is <td>, whose parent is <tr> (row)
            const table = row.parentNode;
            const rowCount = table.querySelectorAll('.compound-selector').length - 1; // direct number of entries - removed row = future number of entries
            if (rowCount > 0) {
                table.removeChild(row);
                if (rowCount < 3) {
                    addButton.classList.remove('upgrade-button');
                    //document.getElementById('add-button').classList.add('unlocked')
                    if (rowCount === 1) {
                        // if only one compound row remains, change button display to indicate it will work differently
                        ;
                        table.querySelector('.compound-selector button').classList.add('no-remove');
                    }
                }
                // lock last row's mol %
                const lastCompoundFraction = Array(...gasCompTable.rows) // directly get last entry row pf table
                    .findLast(row => row.querySelector('.compound-frac-input') !== null).querySelector('input.compound-frac-input'); // get the fraction number entry in it
                if (disableLastRow) {
                    lastCompoundFraction.disabled = true; // QUESTION: do we still want the last input locked, since the inputs are normalized anyways
                }
                /* last row's value is 1 - sum of the rest of the row, to specified decimal places.
                 * with percentages enabled, it's 100 - sum
                 */
                lastCompoundFraction.value = (Math.round((10 ** moleFractionDecimalPlaces) * (getWhole(percentagesEnabled) - (Array(...document.querySelectorAll('#compoundEntries .compound-frac-input')).map(input => parseFloatDefault(input.value, 0))
                    .reduce((a, b) => a + b) - parseFloatDefault(lastCompoundFraction.value, 0)))) / (10 ** moleFractionDecimalPlaces)).toString();
            }
            else {
                // instead of removing the last compound (which wouldn't make sense, and would invalidate the inputs), change selected compound to standard air
                const compoundSelect = row.querySelector('.compound-selector select');
                compoundSelect.options.selectedIndex = Array(...compoundSelect.options).findIndex(option => option.value === 'air, standard');
            }
            updateCompoundAverages();
        }
        // I/O: make all compound selectors update the info on the rows next to them
        const updateSpecificHeat = (specificHeatText, compound) => {
            specificHeatText.textContent = (specificHeatByCompound[compound]).toString();
        };
        const updateMolecularWeight = (molecularWeightText, compound) => {
            molecularWeightText.textContent = (molecularWeightByCompound[compound]).toString();
        };
        // I/O: update compound summaries (once now, and every time a compound is added, removed, or selected, and every time a mol% is changed)
        const updateCompoundAverages = () => {
            const { spHeat, molWeight } = Array(...gasCompTable.rows).map(row => {
                // first map compound data to be weighted by mole fractions
                if (row.querySelector('.compound-selector') !== null) {
                    const selectedMolecule = row.querySelector('.compound-selector select').value;
                    if (compoundMap.has(selectedMolecule)) {
                        // get compound from input text value
                        const compound = compoundMap.get(selectedMolecule);
                        // TODO: percent - if the corresponding percent box is toggled, divide this by 100
                        const frac = parseFloatDefault(row.querySelector('.compound-frac-input').value, 0) / getWhole(percentagesEnabled);
                        return {
                            spHeat: specificHeatByCompound[compound] * frac,
                            molWeight: molecularWeightByCompound[compound] * frac
                        };
                    }
                    else
                        throw "Illegal compound selected (the page is probably coded wrong)";
                }
                else
                    return { spHeat: 0, molWeight: 0 };
            }).reduce((a, b) => ({
                // then sum data together for the average
                spHeat: a.spHeat + b.spHeat,
                molWeight: a.molWeight + b.molWeight
            }));
            // avgSpecificHeatText.textContent = formatNumber(spHeat, moleFractionDecimalPlaces)
            // avgMolecularWeightText.textContent = formatNumber(molWeight, moleFractionDecimalPlaces)
        };
        updateCompoundAverages();
        document.querySelectorAll('.compound-selector select').forEach((select) => {
            const row = select.parentNode.parentNode;
            const specificHeatCell = row.querySelector('.row-specific-heat');
            const molecularWeightText = row.querySelector('.row-molecular-weight');
            updateSpecificHeat(specificHeatCell, compoundMap.get(select.value));
            updateMolecularWeight(molecularWeightText, compoundMap.get(select.value));
            select.addEventListener('change', () => {
                updateSpecificHeat(specificHeatCell, compoundMap.get(select.value));
                updateMolecularWeight(molecularWeightText, compoundMap.get(select.value));
                updateCompoundAverages();
            });
        });
        document.querySelectorAll('.remove-compound').forEach((button) => button.onclick = () => { removeCompound(button); });
        // make add button add a new compound row
        addButton.addEventListener('click', e => { addCompound(); });
    };
    setUpGasCompTable();
}
if (document.readyState !== 'loading')
    main();
else
    document.addEventListener('DOMContentLoaded', main);
Array(...document.querySelectorAll('.no-negative')).forEach((element) => {
    element.addEventListener('input', _ => {
        // @ts-ignore
        element.value = !!element.value && Math.abs(element.value) >= 0 ? Math.abs(element.value) : null;
    });
});
// make > 100% composition rejected (done)
// outfill last to make 100% (done)
// color inputs (done)
// potentially shrink inputs
// add molecular weight and specific heat data by compound (that means adding column headers) (done)
// (then add summary weight + specific heat at bottom) (done)
// fix gas guty (done)
/**
 * On compound select: change specific heat ratio and molecular weight (done)
 * On addCompound: fill in correct ratio and molecular weight and mole % (done)
 * On mole % entry: fix last mole % entry (done)
 */
/**
 * Questions:
 *  Currently, inputs have a step button that lets you click to increment by a little (0.1, but this can be configured).
 *  However, this makes the page reject inputs that aren't a multiple of this step. Which is more important? (This could be fixed to allow both, but it
 * would require reworking parts of the page, which would be annoying to code).
 *
 * We can un-grey the last gas input and still maintain the normalizing functionality. Would you like that?
 * Should it be impossible to select compounds that have already been selected?
 * (for: would be silly; against: maybe someone wants to re-order their compounds, and this would be convenient)
 *
 *
 */
/**Return string which is a valid string for a string input field which is only allowed to hold, while including as much of the input as possible.
const filterNumberInput = (str: string, allowPercent=false, decimalPlaces: number) => str
    .replaceAll(/\./g, (() => { let count = 0; return (match: string) => { count++; return count > 1 ? '' : match } })()) // remove all but the first decimal point (only one is allowed)
    .replaceAll(/[^\d.]/g, '') // remove everything that isn't a number or a decimal point (not allowed, except %, which will be added back later.)
    //.match(/\d{0, 3}(\.\d{0, `/)
    + (str.includes('%') && allowPercent ? '%' : '') // if percent sign existed and is allowed, add it back to the end

const parseNumberStr = (str: string) => str.endsWith('%')
    ? parseFloat(str) / 100
    : parseFloat(str)

// const readNumberInput = (str: string, allowPercent=false) => parseNumberStr(filterNumberInput(str, allowPercent))
const fixNumberInput = (str: string, allowPercent: boolean) => {
    const numeric = str.replaceAll(/[^\d.]/g, '')
    const groups = numeric.split('.')
    const decimalString = g
}
*/
